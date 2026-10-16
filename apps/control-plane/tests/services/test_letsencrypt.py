from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from datetime import UTC, datetime, timedelta
from hashlib import sha256

import httpx

from app.services.dns01 import MemoryDns01
from app.services.letsencrypt import (
    LetsEncryptIssuer,
    dns01_txt_value,
    generate_account_key_pem,
    jwk_thumbprint,
    account_jwk,
    load_account_key,
)


def _self_signed_pem(hostname: str) -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test LE")]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=90))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]), critical=False)
        .sign(key, hashes.SHA256())
    )
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def _acme_app(hostname: str, account_pem: str) -> httpx.MockTransport:
    nonce = "nonce-1"
    order = {
        "status": "pending",
        "authorizations": ["https://acme.test/authz/1"],
        "finalize": "https://acme.test/finalize/1",
        "url": "https://acme.test/order/1",
    }
    key = load_account_key(account_pem)
    expected_txt = dns01_txt_value("tok", jwk_thumbprint(account_jwk(key)))
    presented = {"value": None}

    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"Replay-Nonce": nonce, "Content-Type": "application/json"}
        path = request.url.path
        if request.method == "GET" and path == "/directory":
            return httpx.Response(
                200,
                headers=headers,
                json={
                    "newNonce": "https://acme.test/nonce",
                    "newAccount": "https://acme.test/new-account",
                    "newOrder": "https://acme.test/new-order",
                },
            )
        if request.method == "HEAD" and path == "/nonce":
            return httpx.Response(200, headers=headers)
        if path == "/new-account":
            return httpx.Response(201, headers={**headers, "Location": "https://acme.test/acct/1"}, json={"status": "valid"})
        if path == "/new-order":
            order["status"] = "pending"
            return httpx.Response(201, headers=headers, json=order)
        if path == "/authz/1":
            return httpx.Response(
                200,
                headers=headers,
                json={"status": "pending", "challenges": [{"type": "dns-01", "url": "https://acme.test/chal/1", "token": "tok"}]},
            )
        if path == "/chal/1":
            presented["value"] = expected_txt
            order["status"] = "ready"
            return httpx.Response(200, headers=headers, json={"status": "valid"})
        if path == "/order/1":
            return httpx.Response(200, headers=headers, json=order)
        if path == "/finalize/1":
            order["status"] = "valid"
            order["certificate"] = "https://acme.test/cert/1"
            return httpx.Response(200, headers=headers, json=order)
        if path == "/cert/1":
            return httpx.Response(
                200,
                headers={**headers, "Content-Type": "application/pem-certificate-chain"},
                content=_self_signed_pem(hostname).encode(),
            )
        return httpx.Response(404, json={"type": "urn:ietf:params:acme:error:malformed"})

    return httpx.MockTransport(handler)


def test_letsencrypt_presents_dns01_and_returns_pem() -> None:
    hostname = "app.aero-deck.app"
    account_pem = generate_account_key_pem()
    dns = MemoryDns01()
    http = httpx.Client(transport=_acme_app(hostname, account_pem))
    issuer = LetsEncryptIssuer(
        dns,
        directory_url="https://acme.test/directory",
        account_email="ops@aero-deck.app",
        account_key_pem=account_pem,
        http=http,
        settle_seconds=0,
    )
    material = issuer.issue(hostname)
    assert hostname not in dns.records
    assert material.certificate_pem.startswith("-----BEGIN CERTIFICATE-----")
    assert "PRIVATE KEY" in material.private_key_pem
    assert len(material.fingerprint_sha256) == 64
    assert material.not_after > datetime.now(UTC)


def test_dns01_txt_is_sha256_of_key_authorization() -> None:
    pem = generate_account_key_pem()
    thumb = jwk_thumbprint(account_jwk(load_account_key(pem)))
    digest = dns01_txt_value("abc", thumb)
    expected = sha256(f"abc.{thumb}".encode()).digest()
    import base64

    assert digest == base64.urlsafe_b64encode(expected).rstrip(b"=").decode("ascii")
