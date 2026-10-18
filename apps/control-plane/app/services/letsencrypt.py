"""RFC 8555 ACME client that drives Dns01Provider then stores a real certificate.

Default directory is Let's Encrypt staging. Production is an explicit URL.
"""

from __future__ import annotations

import base64
import json
import time
from hashlib import sha256

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID

from app.services.acme import IssuedCertificate, IssuerError
from app.services.dns01 import Dns01Provider

STAGING_DIRECTORY = "https://acme-staging-v02.api.letsencrypt.org/directory"
PRODUCTION_DIRECTORY = "https://acme-v02.api.letsencrypt.org/directory"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def load_account_key(pem: str) -> rsa.RSAPrivateKey:
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise IssuerError("AERODECK_ACME_ACCOUNT_KEY must be an RSA PEM private key")
    return key


def account_jwk(key: rsa.RSAPrivateKey) -> dict[str, str]:
    numbers = key.public_key().public_numbers()
    n_len = (numbers.n.bit_length() + 7) // 8
    e_len = (numbers.e.bit_length() + 7) // 8
    return {
        "e": _b64(numbers.e.to_bytes(e_len, "big")),
        "kty": "RSA",
        "n": _b64(numbers.n.to_bytes(n_len, "big")),
    }


def jwk_thumbprint(jwk: dict[str, str]) -> str:
    canonical = json.dumps(jwk, separators=(",", ":"), sort_keys=True).encode()
    return _b64(sha256(canonical).digest())


def dns01_txt_value(token: str, thumbprint: str) -> str:
    return _b64(sha256(f"{token}.{thumbprint}".encode()).digest())


def _csr_der(hostname: str, key: rsa.RSAPrivateKey) -> bytes:
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)]))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]), critical=False)
        .sign(key, hashes.SHA256())
    )
    return csr.public_bytes(serialization.Encoding.DER)


def _leaf_material(pem_chain: str, key: rsa.RSAPrivateKey) -> IssuedCertificate:
    cert = x509.load_pem_x509_certificate(pem_chain.encode())
    not_after = cert.not_valid_after_utc
    fingerprint = sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    private_key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return IssuedCertificate(pem_chain, private_key_pem, not_after, fingerprint)


class LetsEncryptIssuer:
    """Presents DNS-01 via Dns01Provider, then finalizes an ACME order."""

    def __init__(
        self,
        dns: Dns01Provider,
        *,
        directory_url: str,
        account_email: str,
        account_key_pem: str,
        http: httpx.Client | None = None,
        settle_seconds: float = 15,
    ) -> None:
        if not account_email.strip():
            raise IssuerError("AERODECK_ACME_ACCOUNT_EMAIL is required")
        self._dns = dns
        self._directory_url = directory_url
        self._email = account_email.strip()
        self._key = load_account_key(account_key_pem)
        self._http = http or httpx.Client(timeout=30.0)
        self._settle_seconds = settle_seconds
        self._nonce: str | None = None
        self._kid: str | None = None
        self._directory: dict[str, str] | None = None

    def issue(self, hostname: str) -> IssuedCertificate:
        directory = self._load_directory()
        self._ensure_account(directory["newAccount"])
        order = self._signed_post(
            directory["newOrder"],
            {"identifiers": [{"type": "dns", "value": hostname}]},
        )
        order_url = order.get("url")
        if not isinstance(order_url, str) or not order_url:
            raise IssuerError("ACME newOrder did not return an order URL")
        authz = self._signed_post(order["authorizations"][0], None)
        challenge = next(c for c in authz["challenges"] if c["type"] == "dns-01")
        digest = dns01_txt_value(challenge["token"], jwk_thumbprint(account_jwk(self._key)))
        self._dns.present(hostname, digest)
        try:
            if self._settle_seconds:
                time.sleep(self._settle_seconds)
            self._signed_post(challenge["url"], {})
            self._wait_status(order_url, wanted="ready")
            cert_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            finalized = self._signed_post(order["finalize"], {"csr": _b64(_csr_der(hostname, cert_key))})
            if finalized.get("status") != "valid":
                finalized = self._wait_status(order_url, wanted="valid")
            cert_url = finalized.get("certificate")
            if not cert_url:
                raise IssuerError("ACME order had no certificate URL")
            pem = self._signed_post(cert_url, None, as_text=True)
            return _leaf_material(pem, cert_key)
        finally:
            self._dns.cleanup(hostname)

    def renew(self, hostname: str) -> IssuedCertificate:
        return self.issue(hostname)

    def _load_directory(self) -> dict[str, str]:
        if self._directory is None:
            response = self._http.get(self._directory_url)
            self._capture_nonce(response)
            if response.status_code >= 400:
                raise IssuerError(f"ACME directory {self._directory_url} returned {response.status_code}")
            self._directory = response.json()
        return self._directory

    def _ensure_account(self, new_account: str) -> None:
        if self._kid:
            return
        payload = {"termsOfServiceAgreed": True, "contact": [f"mailto:{self._email}"]}
        response = self._post_jws(new_account, payload, kid=None)
        if response.status_code not in {200, 201}:
            raise IssuerError(f"ACME newAccount returned {response.status_code}")
        location = response.headers.get("Location")
        if not location:
            raise IssuerError("ACME newAccount did not return Location (kid)")
        self._kid = location

    def _wait_status(self, url: str, *, wanted: str) -> dict:
        for _ in range(20):
            body = self._signed_post(url, None)
            if body.get("status") == wanted:
                return body
            if body.get("status") in {"invalid", "revoked"}:
                raise IssuerError(f"ACME order {body.get('status')}")
            time.sleep(0.25 if self._settle_seconds == 0 else 1.0)
        raise IssuerError(f"ACME order did not become {wanted}")

    def _signed_post(self, url: str, payload: dict | None, *, as_text: bool = False) -> dict | str:
        response = self._post_jws(url, payload, kid=self._kid)
        if response.status_code >= 400:
            raise IssuerError(f"ACME POST {url} returned {response.status_code}: {response.text[-500:]}")
        if as_text:
            return response.text
        if not response.content:
            return {}
        body = response.json()
        # RFC 8555 puts the new order URL in Location. Let's Encrypt omits "url" in the body.
        if isinstance(body, dict):
            location = response.headers.get("Location")
            if location and not body.get("url"):
                body = {**body, "url": location}
        return body

    def _post_jws(self, url: str, payload: dict | None, *, kid: str | None) -> httpx.Response:
        if self._nonce is None:
            self._load_directory()
            new_nonce = (self._directory or {}).get("newNonce")
            if new_nonce:
                head = self._http.head(new_nonce)
                self._capture_nonce(head)
        protected: dict[str, object] = {"alg": "RS256", "nonce": self._nonce, "url": url}
        if kid:
            protected["kid"] = kid
        else:
            protected["jwk"] = account_jwk(self._key)
        payload_b64 = "" if payload is None else _b64(json.dumps(payload).encode())
        protected_b64 = _b64(json.dumps(protected, separators=(",", ":"), sort_keys=True).encode())
        signing_input = f"{protected_b64}.{payload_b64}".encode()
        signature = self._key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        body = {"protected": protected_b64, "payload": payload_b64, "signature": _b64(signature)}
        response = self._http.post(url, json=body, headers={"Content-Type": "application/jose+json"})
        self._capture_nonce(response)
        return response

    def _capture_nonce(self, response: httpx.Response) -> None:
        nonce = response.headers.get("Replay-Nonce")
        if nonce:
            self._nonce = nonce


def generate_account_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
