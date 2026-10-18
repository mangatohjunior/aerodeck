from app.core.metrics import IAC_APPLY_FAILURES, SANDBOX_REAP_FAILURES, increment, render


def test_render_exports_checks_and_counters() -> None:
    body = render(
        {"database": "failed", "queue": "ok"},
        {SANDBOX_REAP_FAILURES: 2, IAC_APPLY_FAILURES: 1},
    )
    assert 'aerodeck_check_up{check="database"} 0' in body
    assert 'aerodeck_check_up{check="queue"} 1' in body
    assert "aerodeck_sandbox_reap_failures_total 2" in body
    assert "aerodeck_iac_apply_failures_total 1" in body
    assert "BEGIN" not in body
    assert "://" not in body


def test_increment_ignores_an_unknown_counter() -> None:
    increment("redis://127.0.0.1:6379/0", "not-a-counter")


def test_increment_swallows_a_redis_outage(monkeypatch) -> None:
    class Down:
        def incr(self, key: str) -> None:
            raise ConnectionError("down")

        def close(self) -> None:
            return None

    monkeypatch.setattr("app.core.metrics.Redis.from_url", lambda *args, **kwargs: Down())
    increment("redis://127.0.0.1:6379/0", SANDBOX_REAP_FAILURES)
