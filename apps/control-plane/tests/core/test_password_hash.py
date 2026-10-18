from app.core.security import hash_password, verify_password


def test_hash_password_does_not_keep_the_password() -> None:
    password = "correct-horse"
    stored = hash_password(password)
    assert password not in stored
    assert stored.startswith("scrypt$")
    assert hash_password(password) != stored
    assert verify_password(password, stored)
    assert not verify_password("wrong-horse", stored)
    assert not verify_password(password, "not-a-hash")
