import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.services.hypervisor import FirecrackerHypervisor, MemoryHypervisor, SandboxError, image_paths


def test_image_paths_join_kernel_and_rootfs() -> None:
    kernel, rootfs = image_paths("alpine-3.20", "/var/lib/aerodeck/images")
    assert kernel.name == "vmlinux"
    assert rootfs.name == "rootfs.ext4"
    assert kernel.parent.name == "alpine-3.20"


def test_image_paths_rejects_traversal() -> None:
    with pytest.raises(SandboxError):
        image_paths("..", "/var/lib/aerodeck/images")
    with pytest.raises(SandboxError):
        image_paths("a/b", "/var/lib/aerodeck/images")
    with pytest.raises(SandboxError):
        image_paths("a\\b", "/var/lib/aerodeck/images")


def test_memory_hypervisor_boots_and_stops() -> None:
    hypervisor = MemoryHypervisor()
    sandbox_id = uuid4()
    machine = hypervisor.boot(sandbox_id, "alpine-3.20", 1, 128)
    assert machine.vm_id == sandbox_id.hex
    assert machine.vm_id in hypervisor.booted
    hypervisor.stop(machine.vm_id)
    assert machine.vm_id not in hypervisor.booted
    hypervisor.stop(machine.vm_id)


def test_firecracker_hypervisor_starts_the_instance() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(204)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://firecracker")
    hypervisor = FirecrackerHypervisor(
        api_url="http://firecracker", image_root="/var/lib/aerodeck/images", client=client
    )
    sandbox_id = uuid4()
    machine = hypervisor.boot(sandbox_id, "alpine-3.20", 2, 256)

    assert machine.vm_id == sandbox_id.hex
    assert [request.method for request in calls] == ["PUT", "PUT", "PUT", "PUT"]
    assert [request.url.path for request in calls] == [
        "/machine-config",
        "/boot-source",
        "/drives/rootfs",
        "/actions",
    ]
    assert json.loads(calls[0].content) == {"vcpu_count": 2, "mem_size_mib": 256}
    boot = json.loads(calls[1].content)
    assert Path(boot["kernel_image_path"]).name == "vmlinux"
    assert Path(boot["kernel_image_path"]).parent.name == "alpine-3.20"
    drive = json.loads(calls[2].content)
    assert drive["is_root_device"] is True
    assert Path(drive["path_on_host"]).name == "rootfs.ext4"
    assert json.loads(calls[3].content) == {"action_type": "InstanceStart"}


def test_firecracker_hypervisor_maps_http_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"fault_message": "bad config"})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://firecracker")
    hypervisor = FirecrackerHypervisor(
        api_url="http://firecracker", image_root="/var/lib/aerodeck/images", client=client
    )
    with pytest.raises(SandboxError):
        hypervisor.boot(uuid4(), "alpine-3.20", 1, 128)


def test_firecracker_hypervisor_sends_ctrl_alt_del() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(204)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://firecracker")
    hypervisor = FirecrackerHypervisor(
        api_url="http://firecracker", image_root="/var/lib/aerodeck/images", client=client
    )
    hypervisor.stop("abc123")
    assert calls[0].method == "PUT"
    assert calls[0].url.path == "/actions"
    assert json.loads(calls[0].content) == {"action_type": "SendCtrlAltDel"}


def test_firecracker_stop_treats_missing_instance_as_gone() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://firecracker")
    hypervisor = FirecrackerHypervisor(
        api_url="http://firecracker", image_root="/var/lib/aerodeck/images", client=client
    )
    hypervisor.stop("already-gone")
