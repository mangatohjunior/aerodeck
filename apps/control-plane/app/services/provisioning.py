"""The work a job performs, behind a protocol so the worker does not care who does it.

Only ``NoopProvisioner`` exists until the IaC engine is wired in (#5). It makes
no changes and says so in its outcome.
"""

import enum
from dataclasses import asdict, dataclass
from typing import Protocol


class JobKind(enum.StrEnum):
    provision = "provision"
    reconcile = "reconcile"


class TransientJobError(Exception):
    """Worth retrying: provider rate limit, network blip, lock held by another run."""


class PermanentJobError(Exception):
    """Retrying will not help: bad input, policy violation, resource gone."""


@dataclass(frozen=True, slots=True)
class JobOutcome:
    kind: JobKind
    project_id: str
    environment_id: str
    changed: bool
    detail: str

    def as_dict(self) -> dict[str, str | bool]:
        payload = asdict(self)
        payload["kind"] = self.kind.value
        return payload


class Provisioner(Protocol):
    def provision(self, *, project_id: str, environment_id: str) -> JobOutcome: ...

    def reconcile(self, *, project_id: str, environment_id: str) -> JobOutcome: ...


class NoopProvisioner:
    _DETAIL = "No infrastructure engine is connected yet (#5); nothing was changed."

    def provision(self, *, project_id: str, environment_id: str) -> JobOutcome:
        return JobOutcome(JobKind.provision, project_id, environment_id, changed=False, detail=self._DETAIL)

    def reconcile(self, *, project_id: str, environment_id: str) -> JobOutcome:
        return JobOutcome(JobKind.reconcile, project_id, environment_id, changed=False, detail=self._DETAIL)
