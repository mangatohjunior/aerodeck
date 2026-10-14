import json

import httpx
import pytest

from app.services.dns01 import address_record_name
from app.services.dns_records import DigitalOceanDnsRecords, DnsRecordError, MemoryDnsRecords


def test_address_record_name_uses_at_for_apex() -> None:
    assert address_record_name("payments.example.com") == ("example.com", "payments")
    assert address_record_name("example.com") == ("example.com", "@")


def test_memory_publisher_upserts_and_deletes() -> None:
    dns = MemoryDnsRecords()
    published = dns.upsert("app.example.com", "CNAME", "edge.example.com", 300)
    assert dns.published["app.example.com"].data == "edge.example.com"
    assert published.provider_record_id == "1"
    dns.delete("app.example.com", published.provider_record_id)
    assert "app.example.com" not in dns.published


def test_digitalocean_publisher_creates_and_deletes_cname() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"domain_record": {"id": 99, "type": "CNAME"}})
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(500)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.digitalocean.com")
    dns = DigitalOceanDnsRecords("do-token", client=client)
    published = dns.upsert("payments.example.com", "CNAME", "edge.example.com", 300)
    dns.delete("payments.example.com", published.provider_record_id)

    assert published.provider_record_id == "99"
    assert calls[0].method == "POST"
    assert str(calls[0].url) == "https://api.digitalocean.com/v2/domains/example.com/records"
    assert calls[0].headers["Authorization"] == "Bearer do-token"
    assert json.loads(calls[0].content) == {
        "type": "CNAME",
        "name": "payments",
        "data": "edge.example.com",
        "ttl": 300,
    }
    assert calls[1].method == "DELETE"
    assert str(calls[1].url) == "https://api.digitalocean.com/v2/domains/example.com/records/99"


def test_digitalocean_publisher_maps_http_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "unauthorized"})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.digitalocean.com")
    dns = DigitalOceanDnsRecords("bad", client=client)
    with pytest.raises(DnsRecordError):
        dns.upsert("app.example.com", "A", "203.0.113.10", 60)
