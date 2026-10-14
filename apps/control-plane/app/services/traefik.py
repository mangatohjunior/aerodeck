"""Render declared routes as Traefik v3 HTTP dynamic configuration."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.schemas.certificate import TraefikRouterTls, TraefikTls, TraefikTlsCertificate
from app.schemas.route import TraefikConfiguration, TraefikHttp, TraefikLoadBalancer, TraefikRouter, TraefikServer, TraefikService


class Routable(Protocol):
    id: UUID
    hostname: str
    path_prefix: str
    backend_host: str
    backend_port: int
    entrypoint: str
    enabled: bool


@dataclass(frozen=True, slots=True)
class TlsMaterial:
    hostname: str
    certificate_pem: str
    private_key_pem: str


@dataclass(frozen=True, slots=True)
class RouteSpec:
    """Stand-in for an ORM Route when rendering without a session."""

    id: UUID
    hostname: str
    path_prefix: str
    backend_host: str
    backend_port: int
    entrypoint: str
    enabled: bool = True


def router_name(route_id: UUID) -> str:
    return f"rt-{route_id.hex}"


def host_rule(hostname: str, path_prefix: str) -> str:
    rule = f"Host(`{hostname}`)"
    if path_prefix != "/":
        rule += f" && PathPrefix(`{path_prefix}`)"
    return rule


def backend_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def render_traefik_http(
    routes: Sequence[Routable],
    certificates: Sequence[TlsMaterial] | None = None,
) -> TraefikConfiguration:
    by_host = {item.hostname: item for item in certificates or ()}
    routers: dict[str, TraefikRouter] = {}
    services: dict[str, TraefikService] = {}
    tls_certs: list[TraefikTlsCertificate] = []
    for route in routes:
        if not route.enabled:
            continue
        name = router_name(route.id)
        material = by_host.get(route.hostname)
        routers[name] = TraefikRouter(
            rule=host_rule(route.hostname, route.path_prefix),
            service=name,
            entryPoints=["websecure"] if material else [route.entrypoint],
            tls=TraefikRouterTls() if material else None,
        )
        services[name] = TraefikService(
            loadBalancer=TraefikLoadBalancer(
                servers=[TraefikServer(url=backend_url(route.backend_host, route.backend_port))]
            )
        )
        if material:
            tls_certs.append(TraefikTlsCertificate(certFile=material.certificate_pem, keyFile=material.private_key_pem))
    return TraefikConfiguration(
        http=TraefikHttp(routers=routers, services=services),
        tls=TraefikTls(certificates=tls_certs) if tls_certs else None,
    )
