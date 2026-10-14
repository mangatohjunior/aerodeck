import json

import httpx
import pytest

from app.services.dns01 import DigitalOceanDns01, Dns01Error, MemoryDns01, dns01_target


def test_dns01_target_splits_zone_and_challenge_name() -> None:
    assert dns01_target("payments.example.com") == ("example.com", "_acme-challenge.payments")
    assert dns01_target("example.com") == ("example.com", "_acme-challenge")


def test_dns01_target_rejects_a_single_label() -> None:
    with pytest.raises(Dns01Error):
        dns01_target("localhost")


def test_memory_dns01_present_and_cleanup() -> None:
    dns = MemoryDns01()
    dns.present("app.example.com", "token-1")
    assert dns.records["app.example.com"] == "token-1"
    dns.cleanup("app.example.com")
    assert "app.example.com" not in dns.records


def test_digitalocean_dns01_creates_and_deletes_txt_records() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"domain_record": {"id": 42, "type": "TXT"}})
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(500)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.digitalocean.com")
    dns = DigitalOceanDns01("do-token", client=client)
    dns.present("payments.example.com", "dns01-digest")
    dns.cleanup("payments.example.com")

    assert calls[0].method == "POST"
    assert str(calls[0].url) == "https://api.digitalocean.com/v2/domains/example.com/records"
    assert calls[0].headers["Authorization"] == "Bearer do-token"
    body = json.loads(calls[0].content)
    assert body == {"type": "TXT", "name": "_acme-challenge.payments", "data": "dns01-digest", "ttl": 30}
    assert calls[1].method == "DELETE"
    assert str(calls[1].url) == "https://api.digitalocean.com/v2/domains/example.com/records/42"
