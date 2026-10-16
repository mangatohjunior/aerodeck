"""Tenant Terraform provisioner: Spaces state, stored plans, no -auto-approve."""

from __future__ import annotations

import json
from pathlib import Path
from subprocess import CompletedProcess

import pytest

from app.services.provisioning import PermanentJobError, TransientJobError
from app.services.terraform_provisioner import TerraformProvisioner, plan_has_changes, tenant_state_key

PROJECT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ENVIRONMENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class FakeTerraform:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.lock = False
        self.changed = True

    def run(self, args: list[str], *, cwd: Path, env: dict[str, str]) -> CompletedProcess[str]:
        self.calls.append(args)
        assert env["TF_VAR_do_token"] == "dop_token"
        assert env["AWS_ACCESS_KEY_ID"] == "spaces-key"
        if self.lock:
            return CompletedProcess(args, 1, stdout="", stderr="Error acquiring the state lock")
        if "show" in args and "-json" in args:
            actions = ["create"] if self.changed else ["no-op"]
            payload = {"resource_changes": [{"change": {"actions": actions}}]}
            return CompletedProcess(args, 0, stdout=json.dumps(payload), stderr="")
        return CompletedProcess(args, 0, stdout="", stderr="")


def _provisioner(**overrides: object) -> tuple[TerraformProvisioner, FakeTerraform]:
    fake = FakeTerraform()
    engine = Path("/opt/aerodeck/iac-engine/stacks/tenant")
    kwargs = {
        "stack_dir": engine,
        "backend_hcl": engine.parents[1] / "backend.hcl",
        "terraform_bin": "terraform",
        "do_token": "dop_token",
        "spaces_access_id": "spaces-key",
        "spaces_secret_key": "spaces-secret",
        "apply_enabled": False,
        "runner": fake,
    }
    kwargs.update(overrides)
    return TerraformProvisioner(**kwargs), fake  # type: ignore[arg-type]


def test_state_key_is_tenant_not_platform() -> None:
    assert tenant_state_key(PROJECT, ENVIRONMENT) == f"tenants/{PROJECT}/{ENVIRONMENT}/terraform.tfstate"
    with pytest.raises(PermanentJobError):
        tenant_state_key("platform", ENVIRONMENT)
    with pytest.raises(PermanentJobError):
        tenant_state_key("../x", ENVIRONMENT)


def test_plan_has_changes_ignores_noops() -> None:
    assert plan_has_changes({"resource_changes": [{"change": {"actions": ["no-op"]}}]}) is False
    assert plan_has_changes({"resource_changes": [{"change": {"actions": ["create"]}}]}) is True


def test_dry_run_plans_and_skips_apply() -> None:
    provisioner, fake = _provisioner(apply_enabled=False)
    outcome = provisioner.provision(
        project_id=PROJECT,
        environment_id=ENVIRONMENT,
        project_slug="payments",
        environment_slug="dev",
        environment_kind="dev",
        region="ams3",
    )
    joined = [" ".join(c) for c in fake.calls]
    assert any("init" in c for c in joined)
    assert any("plan" in c for c in joined)
    assert any("show" in c for c in joined)
    assert not any(" apply " in f" {c} " or c.endswith("apply") for c in joined)
    assert all("-auto-approve" not in c for c in fake.calls)
    assert outcome.changed is True
    assert "dry-run" in outcome.detail
    assert f"key=tenants/{PROJECT}/{ENVIRONMENT}/terraform.tfstate" in " ".join(joined)


def test_apply_uses_stored_plan_without_auto_approve() -> None:
    provisioner, fake = _provisioner(apply_enabled=True)
    outcome = provisioner.provision(
        project_id=PROJECT, environment_id=ENVIRONMENT, environment_kind="prod"
    )
    apply_calls = [c for c in fake.calls if "apply" in c]
    assert len(apply_calls) == 1
    assert "-auto-approve" not in apply_calls[0]
    assert any(arg.endswith("job.tfplan") for arg in apply_calls[0])
    assert outcome.changed is True
    assert "applied stored plan" in outcome.detail


def test_lock_is_transient() -> None:
    provisioner, fake = _provisioner()
    fake.lock = True
    with pytest.raises(TransientJobError):
        provisioner.reconcile(project_id=PROJECT, environment_id=ENVIRONMENT)
