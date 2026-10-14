from uuid import UUID

from app.services.traefik import RouteSpec, backend_url, host_rule, render_traefik_http, router_name

ROUTE_ID = UUID("11111111-1111-1111-1111-111111111111")


def test_host_rule_omits_root_path_prefix() -> None:
    assert host_rule("app.example.com", "/") == "Host(`app.example.com`)"
    assert host_rule("app.example.com", "/api") == "Host(`app.example.com`) && PathPrefix(`/api`)"


def test_render_skips_disabled_routes() -> None:
    enabled = RouteSpec(
        id=ROUTE_ID,
        hostname="on.example.com",
        path_prefix="/",
        backend_host="10.0.0.2",
        backend_port=8080,
        entrypoint="web",
        enabled=True,
    )
    disabled = RouteSpec(
        id=UUID("22222222-2222-2222-2222-222222222222"),
        hostname="off.example.com",
        path_prefix="/",
        backend_host="10.0.0.3",
        backend_port=8080,
        entrypoint="web",
        enabled=False,
    )

    config = render_traefik_http([enabled, disabled])
    name = router_name(ROUTE_ID)

    assert list(config.http.routers) == [name]
    assert config.http.routers[name].entryPoints == ["web"]
    assert config.http.services[name].loadBalancer.servers[0].url == backend_url("10.0.0.2", 8080)


def test_empty_routes_render_empty_http_maps() -> None:
    config = render_traefik_http([])
    assert config.model_dump() == {"http": {"routers": {}, "services": {}}}
