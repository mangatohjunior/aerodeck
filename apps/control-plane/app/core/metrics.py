"""Prometheus text for readiness and failure counters.

Counters live in Redis so the API scrape sees worker failures. The keys hold
integers only. Connection strings and tokens are never written here.
"""

from redis import Redis
from redis import asyncio as aioredis

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("metrics")

SANDBOX_REAP_FAILURES = "aerodeck_sandbox_reap_failures_total"
IAC_APPLY_FAILURES = "aerodeck_iac_apply_failures_total"
COUNTERS = (SANDBOX_REAP_FAILURES, IAC_APPLY_FAILURES)
_REDIS_PREFIX = "aerodeck:metrics:"


def render(checks: dict[str, str], counters: dict[str, int]) -> str:
    lines = [
        "# HELP aerodeck_check_up 1 when a readiness check is ok or skipped, 0 when it failed.",
        "# TYPE aerodeck_check_up gauge",
    ]
    for name in sorted(checks):
        value = 0 if checks[name] == "failed" else 1
        lines.append(f'aerodeck_check_up{{check="{name}"}} {value}')
    lines.append("# HELP aerodeck_sandbox_reap_failures_total Sandboxes the reap could not stop.")
    lines.append("# TYPE aerodeck_sandbox_reap_failures_total counter")
    lines.append(f"{SANDBOX_REAP_FAILURES} {counters.get(SANDBOX_REAP_FAILURES, 0)}")
    lines.append("# HELP aerodeck_iac_apply_failures_total Tenant Terraform provision attempts that failed.")
    lines.append("# TYPE aerodeck_iac_apply_failures_total counter")
    lines.append(f"{IAC_APPLY_FAILURES} {counters.get(IAC_APPLY_FAILURES, 0)}")
    return "\n".join(lines) + "\n"


def record_sandbox_reap_failure() -> None:
    increment(get_settings().redis_url, SANDBOX_REAP_FAILURES)


def record_iac_apply_failure() -> None:
    increment(get_settings().redis_url, IAC_APPLY_FAILURES)


def increment(redis_url: str | None, name: str) -> None:
    """Best-effort INCR. A Redis miss still leaves the log line for the alert."""
    if name not in COUNTERS or not redis_url:
        return
    client = Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        client.incr(_REDIS_PREFIX + name)
    except Exception:
        logger.warning("event=metrics_counter_failed counter=%s", name)
    finally:
        client.close()


async def read_counters(redis_url: str | None) -> dict[str, int]:
    zeros = {name: 0 for name in COUNTERS}
    if not redis_url:
        return zeros
    client = aioredis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        values = await client.mget(*(_REDIS_PREFIX + name for name in COUNTERS))
    except Exception:
        logger.warning("event=metrics_scrape_failed")
        return zeros
    finally:
        await client.aclose()
    loaded = dict(zeros)
    for name, raw in zip(COUNTERS, values, strict=True):
        if raw is not None:
            loaded[name] = int(raw)
    return loaded
