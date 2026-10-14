import uuid
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.certificate import Certificate, CertificateStatus
from app.models.dns_record import DnsRecord
from app.models.route import Route
from app.repositories.certificates import CertificateRepository
from app.repositories.routes import RouteRepository
from app.schemas.route import RouteCreate, RouteUpdate, TraefikConfiguration
from app.services.dns_records import DnsRecordService
from app.services.environments import EnvironmentService
from app.services.projects import ProjectService
from app.services.traefik import TlsMaterial, render_traefik_http

logger = get_logger("services.routes")


class RouteService:
    def __init__(
        self,
        routes: RouteRepository,
        projects: ProjectService,
        environments: EnvironmentService,
        certificates: CertificateRepository,
        dns_records: DnsRecordService,
    ) -> None:
        self._routes = routes
        self._projects = projects
        self._environments = environments
        self._certificates = certificates
        self._dns = dns_records

    async def create(self, project_id: uuid.UUID, data: RouteCreate) -> Route:
        await self._projects.get(project_id)
        await self._environments.get(project_id, data.environment_id)
        if await self._routes.get_by_hostname(data.hostname) is not None:
            raise ConflictError(f"Hostname {data.hostname!r} is already routed")
        try:
            route = await self._routes.add(Route(project_id=project_id, **data.model_dump()))
        except IntegrityError as exc:
            raise ConflictError(f"Hostname {data.hostname!r} is already routed") from exc
        await self._certificates.add(
            Certificate(route_id=route.id, hostname=route.hostname, status=CertificateStatus.pending)
        )
        if route.enabled:
            await self._dns.publish(route)
        logger.info("created route %s (%s)", route.hostname, route.id)
        return route

    async def get(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Route:
        await self._projects.get(project_id)
        route = await self._routes.get(project_id, route_id)
        if route is None:
            raise NotFoundError(f"Route {route_id} not found in project {project_id}")
        return route

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Route], int]:
        await self._projects.get(project_id)
        return await self._routes.list(project_id, limit=limit, offset=offset)

    async def update(self, project_id: uuid.UUID, route_id: uuid.UUID, data: RouteUpdate) -> Route:
        route = await self.get(project_id, route_id)
        changes = data.model_dump(exclude_unset=True)
        new_hostname = changes.get("hostname")
        if new_hostname is not None and new_hostname != route.hostname:
            existing = await self._routes.get_by_hostname(new_hostname)
            if existing is not None and existing.id != route.id:
                raise ConflictError(f"Hostname {new_hostname!r} is already routed")
        hostname_changed = new_hostname is not None and new_hostname != route.hostname
        enabled_changed = "enabled" in changes and changes["enabled"] != route.enabled
        if hostname_changed or (enabled_changed and route.enabled):
            await self._dns.unpublish(route)
        for field, value in changes.items():
            setattr(route, field, value)
        if hostname_changed:
            await self._reset_certificate(route)
        if route.enabled and (hostname_changed or enabled_changed):
            await self._dns.publish(route)
        return route

    async def _reset_certificate(self, route: Route) -> None:
        certificate = await self._certificates.get_for_route(route.id)
        if certificate is None:
            await self._certificates.add(
                Certificate(route_id=route.id, hostname=route.hostname, status=CertificateStatus.pending)
            )
            return
        certificate.hostname = route.hostname
        certificate.status = CertificateStatus.pending
        certificate.not_after = None
        certificate.fingerprint_sha256 = None
        certificate.certificate_pem = None
        certificate.private_key_pem = None
        certificate.last_error = None

    async def delete(self, project_id: uuid.UUID, route_id: uuid.UUID) -> None:
        route = await self.get(project_id, route_id)
        await self._dns.unpublish(route)
        await self._routes.delete(route)
        logger.info("deleted route %s (%s)", route.hostname, route.id)

    async def dns_record(self, project_id: uuid.UUID, route_id: uuid.UUID) -> DnsRecord:
        await self.get(project_id, route_id)
        return await self._dns.require_for_route(route_id)

    async def traefik_configuration(self) -> TraefikConfiguration:
        routes = await self._routes.list_enabled()
        materials = [
            TlsMaterial(hostname=row.hostname, certificate_pem=row.certificate_pem, private_key_pem=row.private_key_pem)
            for row in await self._certificates.list_issued()
            if row.certificate_pem and row.private_key_pem
        ]
        return render_traefik_http(routes, materials)
