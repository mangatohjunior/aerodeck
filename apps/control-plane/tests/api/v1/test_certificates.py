import uuid
from datetime import timedelta

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.api.deps import get_acme_issuer
from app.services.acme import FakeAcmeIssuer
from app.services.dns01 import MemoryDns01

from tests.api.v1.test_environments import envs_url
from tests.api.v1.test_projects import PROJECTS, create_project

EDGE = "/api/v1/edge/traefik"
SECRET_FIELDS = {"private_key_pem", "certificate_pem", "keyFile", "certFile", "pem"}


@pytest.fixture
async def route(client: AsyncClient, auth: dict[str, str]) -> dict:
    project = await create_project(client, auth)
    environment = (
        await client.post(envs_url(project), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)
    ).json()
    created = await client.post(
        f"{PROJECTS}/{project['id']}/routes",
        json={
            "environment_id": environment["id"],
            "hostname": "payments.example.com",
            "backend_host": "10.10.1.20",
            "backend_port": 8080,
        },
        headers=auth,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    body["_project_id"] = project["id"]
    return body


def cert_url(route: dict, action: str | None = None) -> str:
    base = f"{PROJECTS}/{route['_project_id']}/routes/{route['id']}/certificate"
    return f"{base}/{action}" if action else base


async def test_new_route_has_a_pending_certificate(
    client: AsyncClient, auth: dict[str, str], route: dict
) -> None:
    response = await client.get(cert_url(route), headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert body["hostname"] == "payments.example.com"
    assert SECRET_FIELDS.isdisjoint(body)


async def test_issue_puts_tls_on_the_traefik_snapshot(
    client: AsyncClient, auth: dict[str, str], route: dict
) -> None:
    issued = await client.post(cert_url(route, "issue"), headers=auth)
    assert issued.status_code == 200, issued.text
    body = issued.json()
    assert body["status"] == "issued"
    assert body["fingerprint_sha256"]
    assert body["not_after"]
    assert SECRET_FIELDS.isdisjoint(body)

    snapshot = await client.get(EDGE, headers=auth)
    assert snapshot.status_code == 200
    payload = snapshot.json()
    name = f"rt-{uuid.UUID(route['id']).hex}"
    assert payload["http"]["routers"][name]["entryPoints"] == ["websecure"]
    assert payload["http"]["routers"][name]["tls"] == {}
    certs = payload["tls"]["certificates"]
    assert len(certs) == 1
    assert certs[0]["certFile"].startswith("-----BEGIN CERTIFICATE-----")
    assert certs[0]["keyFile"].startswith("-----BEGIN")


async def test_issue_twice_is_a_conflict(client: AsyncClient, auth: dict[str, str], route: dict) -> None:
    assert (await client.post(cert_url(route, "issue"), headers=auth)).status_code == 200
    again = await client.post(cert_url(route, "issue"), headers=auth)
    assert again.status_code == 409
    assert again.json()["code"] == "conflict"


async def test_renew_rotates_fingerprint(client: AsyncClient, auth: dict[str, str], route: dict) -> None:
    first = (await client.post(cert_url(route, "issue"), headers=auth)).json()
    renewed = await client.post(cert_url(route, "renew"), headers=auth)
    assert renewed.status_code == 200
    assert renewed.json()["fingerprint_sha256"] != first["fingerprint_sha256"]
    assert renewed.json()["status"] == "issued"


async def test_renew_without_issue_is_a_conflict(
    client: AsyncClient, auth: dict[str, str], route: dict
) -> None:
    response = await client.post(cert_url(route, "renew"), headers=auth)
    assert response.status_code == 409


async def test_issue_requires_a_token(client: AsyncClient, route: dict) -> None:
    response = await client.post(cert_url(route, "issue"))
    assert response.status_code == 401


async def test_renew_due_rotates_short_lived_certs(
    client: AsyncClient, auth: dict[str, str], route: dict, app: FastAPI
) -> None:
    app.dependency_overrides[get_acme_issuer] = lambda: FakeAcmeIssuer(MemoryDns01(), lifetime=timedelta(days=1))
    issued = await client.post(cert_url(route, "issue"), headers=auth)
    assert issued.status_code == 200, issued.text
    first = issued.json()["fingerprint_sha256"]

    due = await client.post("/api/v1/edge/certificates/renew-due", headers=auth)
    assert due.status_code == 200, due.text
    assert len(due.json()) == 1
    assert due.json()[0]["fingerprint_sha256"] != first
