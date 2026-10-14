import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from starlette.concurrency import run_in_threadpool

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.certificate import Certificate, CertificateStatus
from app.repositories.certificates import CertificateRepository
from app.services.acme import AcmeIssuer, IssuedCertificate, is_due_for_renewal
from app.services.routes import RouteService

logger = get_logger("services.certificates")


class CertificateService:
    def __init__(
        self,
        certificates: CertificateRepository,
        routes: RouteService,
        issuer: AcmeIssuer,
        *,
        renew_before: timedelta,
    ) -> None:
        self._certificates = certificates
        self._routes = routes
        self._issuer = issuer
        self._renew_before = renew_before

    async def get(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Certificate:
        await self._routes.get(project_id, route_id)
        certificate = await self._certificates.get_for_route(route_id)
        if certificate is None:
            raise NotFoundError(f"Certificate for route {route_id} not found")
        return certificate

    async def issue(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Certificate:
        route = await self._routes.get(project_id, route_id)
        certificate = await self._ensure(route.id, route.hostname)
        if certificate.status is CertificateStatus.issued:
            raise ConflictError(f"Hostname {route.hostname!r} already has a certificate; renew instead")
        return await self._mint(certificate, route.hostname, self._issuer.issue)

    async def renew(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Certificate:
        route = await self._routes.get(project_id, route_id)
        certificate = await self._ensure(route.id, route.hostname)
        if certificate.status is not CertificateStatus.issued:
            raise ConflictError(f"Hostname {route.hostname!r} has no issued certificate to renew")
        return await self._mint(certificate, route.hostname, self._issuer.renew)

    async def renew_due(self, *, now: datetime | None = None) -> list[Certificate]:
        moment = now or datetime.now(UTC)
        due = await self._certificates.list_due(moment + self._renew_before)
        renewed: list[Certificate] = []
        for certificate in due:
            if certificate.not_after is None or not is_due_for_renewal(
                certificate.not_after, now=moment, window=self._renew_before
            ):
                continue
            renewed.append(await self._mint(certificate, certificate.hostname, self._issuer.renew))
        return renewed

    async def _ensure(self, route_id: uuid.UUID, hostname: str) -> Certificate:
        certificate = await self._certificates.get_for_route(route_id)
        if certificate is not None:
            certificate.hostname = hostname
            return certificate
        return await self._certificates.add(
            Certificate(route_id=route_id, hostname=hostname, status=CertificateStatus.pending)
        )

    async def _mint(
        self, certificate: Certificate, hostname: str, operation: Callable[[str], IssuedCertificate]
    ) -> Certificate:
        material = await run_in_threadpool(operation, hostname)
        certificate.hostname = hostname
        certificate.status = CertificateStatus.issued
        certificate.not_after = material.not_after
        certificate.fingerprint_sha256 = material.fingerprint_sha256
        certificate.certificate_pem = material.certificate_pem
        certificate.private_key_pem = material.private_key_pem
        certificate.last_error = None
        logger.info("issued certificate for %s until %s", hostname, material.not_after.isoformat())
        return certificate
