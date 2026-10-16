"""The work a job performs, behind a protocol so the worker does not care who does it.

``NoopProvisioner`` is the default until the worker is started with
``AERODECK_IAC_WORKER=true`` (#34). It makes no changes and says so.
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
    def provision(self, *, project_id: str, environment_id: str, **meta: str) -> JobOutcome: ...

    def reconcile(self, *, project_id: str, environment_id: str, **meta: str) -> JobOutcome: ...


class NoopProvisioner:
    _DETAIL = "IaC worker is not enabled (AERODECK_IAC_WORKER); nothing was changed."

    def provision(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
        return JobOutcome(JobKind.provision, project_id, environment_id, changed=False, detail=self._DETAIL)

    def reconcile(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
        return JobOutcome(JobKind.reconcile, project_id, environment_id, changed=False, detail=self._DETAIL)
