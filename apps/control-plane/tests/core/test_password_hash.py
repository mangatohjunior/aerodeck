from app.core.security import hash_password


def test_hash_password_does_not_keep_the_password() -> None:
    password = "correct-horse"
    stored = hash_password(password)
    assert password not in stored
    assert stored.startswith("scrypt$")
    assert hash_password(password) != stored
