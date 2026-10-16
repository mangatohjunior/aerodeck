"""Run the tenant Terraform stack from the worker (#34).

Never targets ``*/platform/terraform.tfstate``. Never passes ``-auto-approve``.
Prod applies only a stored plan file. Lock contention is ``TransientJobError``.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import Settings
from app.services.provisioning import JobKind, JobOutcome, PermanentJobError, TransientJobError

_NO_CHANGE_ACTIONS = frozenset({"no-op", "read"})
_LOCK_MARKERS = ("Error acquiring the state lock", "state lock", "429 Too Many Requests")


class TerraformRunner(Protocol):
    def run(self, args: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]: ...


class SubprocessTerraform:
    def run(self, args: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            cwd=cwd,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=900,
        )


def tenant_state_key(project_id: str, environment_id: str) -> str:
    for label, value in (("project_id", project_id), ("environment_id", environment_id)):
        if not value or "/" in value or ".." in value or value == "platform":
            raise PermanentJobError(f"refusing state key component {label}")
    key = f"tenants/{project_id}/{environment_id}/terraform.tfstate"
    if "/platform/" in key:
        raise PermanentJobError("refusing to use platform Terraform state")
    return key


def plan_has_changes(plan: dict) -> bool:
    for change in plan.get("resource_changes") or []:
        actions = set((change.get("change") or {}).get("actions") or [])
        if actions - _NO_CHANGE_ACTIONS:
            return True
    return False


def _classify_terraform_failure(result: subprocess.CompletedProcess[str]) -> Exception:
    blob = f"{result.stdout}\n{result.stderr}"
    if any(marker.lower() in blob.lower() for marker in _LOCK_MARKERS):
        return TransientJobError(blob[-2000:])
    return PermanentJobError(blob[-2000:] or f"terraform exited {result.returncode}")


@dataclass(frozen=True, slots=True)
class TerraformProvisioner:
    stack_dir: Path
    backend_hcl: Path
    terraform_bin: str
    do_token: str
    spaces_access_id: str
    spaces_secret_key: str
    apply_enabled: bool
    runner: TerraformRunner

    @classmethod
    def from_settings(cls, settings: Settings, runner: TerraformRunner | None = None) -> TerraformProvisioner:
        root = Path(settings.iac_engine_root)
        token = settings.digitalocean_token.get_secret_value() if settings.digitalocean_token else ""
        access = settings.spaces_access_id.get_secret_value() if settings.spaces_access_id else ""
        secret = settings.spaces_secret_key.get_secret_value() if settings.spaces_secret_key else ""
        return cls(
            stack_dir=root,
            backend_hcl=root.parents[1] / "backend.hcl",
            terraform_bin=settings.terraform_bin,
            do_token=token,
            spaces_access_id=access,
            spaces_secret_key=secret,
            apply_enabled=settings.iac_apply,
            runner=runner or SubprocessTerraform(),
        )

    def provision(
        self,
        *,
        project_id: str,
        environment_id: str,
        project_slug: str = "",
        environment_slug: str = "",
        environment_kind: str = "dev",
        region: str = "ams3",
    ) -> JobOutcome:
        return self._run(
            JobKind.provision,
            project_id=project_id,
            environment_id=environment_id,
            project_slug=project_slug,
            environment_slug=environment_slug,
            environment_kind=environment_kind,
            region=region,
        )

    def reconcile(
        self,
        *,
        project_id: str,
        environment_id: str,
        project_slug: str = "",
        environment_slug: str = "",
        environment_kind: str = "dev",
        region: str = "ams3",
    ) -> JobOutcome:
        return self._run(
            JobKind.reconcile,
            project_id=project_id,
            environment_id=environment_id,
            project_slug=project_slug,
            environment_slug=environment_slug,
            environment_kind=environment_kind,
            region=region,
        )

    def _run(
        self,
        job_kind: JobKind,
        *,
        project_id: str,
        environment_id: str,
        project_slug: str,
        environment_slug: str,
        environment_kind: str,
        region: str,
    ) -> JobOutcome:
        if not self.do_token:
            raise PermanentJobError("AERODECK_DIGITALOCEAN_TOKEN is required for the IaC worker")
        if not self.spaces_access_id or not self.spaces_secret_key:
            raise PermanentJobError("Spaces credentials are required for tenant state")
        state_key = tenant_state_key(project_id, environment_id)
        with tempfile.TemporaryDirectory(prefix="aerodeck-tf-") as tmp:
            work = Path(tmp)
            plan_path = work / "job.tfplan"
            env = self._env(work)
            self._terraform(
                [
                    "init",
                    "-input=false",
                    f"-backend-config={self.backend_hcl}",
                    f"-backend-config=key={state_key}",
                ],
                env=env,
            )
            self._terraform(
                [
                    "plan",
                    "-input=false",
                    f"-out={plan_path}",
                    f"-var=project_id={project_id}",
                    f"-var=environment_id={environment_id}",
                    f"-var=project_slug={project_slug}",
                    f"-var=environment_slug={environment_slug}",
                    f"-var=kind={environment_kind}",
                    f"-var=region={region}",
                ],
                env=env,
            )
            shown = self._terraform(["show", "-json", str(plan_path)], env=env)
            try:
                plan = json.loads(shown.stdout or "{}")
            except json.JSONDecodeError as exc:
                raise PermanentJobError("terraform show -json did not return JSON") from exc
            changed = plan_has_changes(plan)
            if not self.apply_enabled:
                return JobOutcome(
                    job_kind,
                    project_id,
                    environment_id,
                    changed=changed,
                    detail="dry-run: terraform plan only (AERODECK_IAC_APPLY is false)",
                )
            apply_args = ["apply", "-input=false", str(plan_path)]
            if "-auto-approve" in apply_args:
                raise PermanentJobError("internal error: -auto-approve must never be passed")
            self._terraform(apply_args, env=env)
            return JobOutcome(
                job_kind,
                project_id,
                environment_id,
                changed=changed,
                detail=f"applied stored plan for {state_key}",
            )

    def _env(self, work: Path) -> dict[str, str]:
        terraform_dir = str(Path(self.terraform_bin).parent)
        return {
            "PATH": f"{terraform_dir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(work),
            "TF_IN_AUTOMATION": "1",
            "TF_INPUT": "0",
            "TF_DATA_DIR": str(work / ".terraform"),
            "TF_VAR_do_token": self.do_token,
            "AWS_ACCESS_KEY_ID": self.spaces_access_id,
            "AWS_SECRET_ACCESS_KEY": self.spaces_secret_key,
        }

    def _terraform(self, args: list[str], *, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        if "-auto-approve" in args:
            raise PermanentJobError("terraform -auto-approve is forbidden")
        result = self.runner.run(
            [self.terraform_bin, f"-chdir={self.stack_dir}", *args],
            cwd=self.stack_dir,
            env=env,
        )
        if result.returncode != 0:
            raise _classify_terraform_failure(result)
        return result
