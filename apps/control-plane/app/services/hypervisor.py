"""Boot Firecracker microVMs. The in-memory fake is the laptop/CI default."""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import UUID

import httpx

from app.core.errors import AppError


class SandboxError(AppError):
    status_code = 502
    code = "sandbox_failed"


class SandboxUnavailableError(AppError):
    status_code = 503
    code = "sandbox_unavailable"


@dataclass(frozen=True, slots=True)
class BootedMachine:
    vm_id: str
    image: str
    vcpu: int
    memory_mib: int


class Hypervisor(Protocol):
    def boot(self, sandbox_id: UUID, image: str, vcpu: int, memory_mib: int) -> BootedMachine: ...

    def stop(self, vm_id: str) -> None: ...

    def for_api(self, api_url: str) -> "Hypervisor": ...


def image_paths(image: str, image_root: str) -> tuple[Path, Path]:
    """Resolve kernel and rootfs for a declared image. Rejects path traversal."""
    if not image or "/" in image or "\\" in image:
        raise SandboxError(f"Image {image!r} is not a declared image name")
    root = Path(image_root).resolve()
    guest = (root / image).resolve()
    if not guest.is_relative_to(root):
        raise SandboxError(f"Image {image!r} is not a declared image name")
    return guest / "vmlinux", guest / "rootfs.ext4"


class MemoryHypervisor:
    """In-process machines for tests and laptops without KVM."""

    def __init__(self) -> None:
        self.booted: dict[str, BootedMachine] = {}

    def boot(self, sandbox_id: UUID, image: str, vcpu: int, memory_mib: int) -> BootedMachine:
        image_paths(image, "/var/lib/aerodeck/images")
        machine = BootedMachine(sandbox_id.hex, image, vcpu, memory_mib)
        self.booted[machine.vm_id] = machine
        return machine

    def stop(self, vm_id: str) -> None:
        self.booted.pop(vm_id, None)

    def for_api(self, api_url: str) -> "MemoryHypervisor":
        return self


class FirecrackerHypervisor:
    """Drives the Firecracker HTTP API (one process / socket per call site)."""

    def __init__(
        self,
        *,
        api_url: str,
        image_root: str,
        client: httpx.Client | None = None,
    ) -> None:
        self._api_url = api_url.rstrip("/")
        self._image_root = image_root
        self._client = client or httpx.Client(base_url=self._api_url, timeout=10.0)

    def boot(self, sandbox_id: UUID, image: str, vcpu: int, memory_mib: int) -> BootedMachine:
        kernel, rootfs = image_paths(image, self._image_root)
        self._put("/machine-config", {"vcpu_count": vcpu, "mem_size_mib": memory_mib})
        self._put(
            "/boot-source",
            {"kernel_image_path": str(kernel), "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"},
        )
        self._put(
            "/drives/rootfs",
            {
                "drive_id": "rootfs",
                "path_on_host": str(rootfs),
                "is_root_device": True,
                "is_read_only": False,
            },
        )
        self._put("/actions", {"action_type": "InstanceStart"})
        return BootedMachine(sandbox_id.hex, image, vcpu, memory_mib)

    def stop(self, vm_id: str) -> None:
        if not vm_id:
            return
        response = self._client.put("/actions", json={"action_type": "SendCtrlAltDel"})
        if response.status_code >= 400 and response.status_code != 404:
            raise SandboxError(f"Firecracker refused to stop {vm_id}: HTTP {response.status_code}")

    def _put(self, path: str, body: dict[str, object]) -> None:
        response = self._client.put(path, json=body)
        if response.status_code >= 400:
            raise SandboxError(f"Firecracker refused {path}: HTTP {response.status_code}")

    def for_api(self, api_url: str) -> "FirecrackerHypervisor":
        return FirecrackerHypervisor(api_url=api_url, image_root=self._image_root)
