"""Render declared routes as Traefik v3 HTTP dynamic configuration."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

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


def render_traefik_http(routes: Sequence[Routable]) -> TraefikConfiguration:
    routers: dict[str, TraefikRouter] = {}
    services: dict[str, TraefikService] = {}
    for route in routes:
        if not route.enabled:
            continue
        name = router_name(route.id)
        routers[name] = TraefikRouter(
            rule=host_rule(route.hostname, route.path_prefix),
            service=name,
            entryPoints=[route.entrypoint],
        )
        services[name] = TraefikService(
            loadBalancer=TraefikLoadBalancer(
                servers=[TraefikServer(url=backend_url(route.backend_host, route.backend_port))]
            )
        )
    return TraefikConfiguration(http=TraefikHttp(routers=routers, services=services))
