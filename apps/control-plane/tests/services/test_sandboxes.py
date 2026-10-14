from datetime import UTC, datetime, timedelta

from app.services.sandboxes import is_expired


def test_is_expired_compares_aware_and_naive_datetimes() -> None:
    now = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
    assert is_expired(datetime(2026, 10, 14, 11, 59, tzinfo=UTC), now=now)
    assert is_expired(datetime(2026, 10, 14, 12, 0), now=now)
    assert not is_expired(now + timedelta(seconds=1), now=now)
