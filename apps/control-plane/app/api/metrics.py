"""Scrape target. No bearer token. Body is numeric checks and counters only."""

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.api.deps import SettingsDep
from app.core.metrics import read_counters, render
from app.core.readiness import collect_checks

router = APIRouter(tags=["metrics"])


@router.get("/metrics", summary="Prometheus metrics")
async def metrics(request: Request, settings: SettingsDep) -> Response:
    engine = getattr(request.app.state, "engine", None)
    checks = await collect_checks(engine, settings.redis_url)
    counters = await read_counters(settings.redis_url)
    return Response(content=render(checks, counters), media_type="text/plain; version=0.0.4; charset=utf-8")
