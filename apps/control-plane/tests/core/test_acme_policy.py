"""Staging and production control planes cannot issue untrusted certificates."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

KEY = "0123456789abcdef0123456789abcdef-signing"
STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory"
PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory"


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, auth_signing_key=KEY, **overrides)


def test_local_and_dev_keep_the_staging_directory() -> None:
    assert _settings(env="local").acme_directory_url == STAGING
    assert _settings(env="dev").acme_directory_url == STAGING


def test_staging_and_production_use_the_production_directory() -> None:
    for env in ("staging", "production", "prod"):
        settings = _settings(env=env, acme_issuer="letsencrypt")
        assert settings.env == ("production" if env == "prod" else env)
        assert settings.acme_directory_url == PRODUCTION


def test_public_environments_reject_a_fake_issuer() -> None:
    with pytest.raises(ValidationError):
        _settings(env="production")


def test_public_environments_reject_a_private_directory() -> None:
    with pytest.raises(ValidationError):
        _settings(
            env="staging",
            acme_issuer="letsencrypt",
            acme_directory_url="https://acme.example.test/directory",
        )
