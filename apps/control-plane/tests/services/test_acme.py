from datetime import UTC, datetime, timedelta

from app.services.acme import FakeAcmeIssuer, is_due_for_renewal, self_signed
from app.services.dns01 import MemoryDns01


def test_fake_issuer_presents_then_cleans_dns01() -> None:
    dns = MemoryDns01()
    issuer = FakeAcmeIssuer(dns, lifetime=timedelta(days=7))
    material = issuer.issue("app.example.com")

    assert "app.example.com" not in dns.records
    assert material.certificate_pem.startswith("-----BEGIN CERTIFICATE-----")
    assert "PRIVATE KEY" in material.private_key_pem
    assert len(material.fingerprint_sha256) == 64
    assert material.not_after > datetime.now(UTC)


def test_self_signed_covers_the_hostname() -> None:
    material = self_signed("web.example.com", lifetime=timedelta(days=1))
    assert material.certificate_pem.startswith("-----BEGIN CERTIFICATE-----")
    assert material.not_after <= datetime.now(UTC) + timedelta(days=2)


def test_due_for_renewal_window() -> None:
    now = datetime.now(UTC)
    assert is_due_for_renewal(now + timedelta(days=10), now=now, window=timedelta(days=30))
    assert not is_due_for_renewal(now + timedelta(days=40), now=now, window=timedelta(days=30))
