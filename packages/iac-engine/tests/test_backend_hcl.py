"""backend.hcl must stay a committed, secret-free Spaces config.

Run from packages/iac-engine:

    python tests/test_backend_hcl.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = (ROOT / "backend.hcl").read_text(encoding="utf-8")
MAIN = (ROOT / "main.tf").read_text(encoding="utf-8")


def _assign(name: str, value: str) -> None:
    if not re.search(rf'^{re.escape(name)}\s*=\s*{re.escape(value)}\s*$', BACKEND, re.M):
        raise SystemExit(f"backend.hcl must set {name} = {value}")


def main() -> None:
    if 'backend "s3" {}' not in MAIN:
        raise SystemExit('main.tf must declare backend "s3" {}')
    _assign("bucket", '"aerodeck-tfstate"')
    if "https://nyc3.digitaloceanspaces.com" not in BACKEND:
        raise SystemExit("backend.hcl must point at nyc3.digitaloceanspaces.com")
    for flag in (
        "skip_credentials_validation",
        "skip_requesting_account_id",
        "skip_metadata_api_check",
        "skip_region_validation",
        "skip_s3_checksum",
    ):
        _assign(flag, "true")
    assignments = "\n".join(line for line in BACKEND.splitlines() if not line.lstrip().startswith("#"))
    for forbidden in ("access_key", "secret_key", "do_token"):
        if re.search(rf"^{forbidden}\s*=", assignments, re.M):
            raise SystemExit(f"backend.hcl must not assign {forbidden}")
    for env in ("dev", "staging", "prod"):
        tfvars = (ROOT / "envs" / f"{env}.tfvars").read_text(encoding="utf-8")
        if f'environment            = "{env}"' not in tfvars and f'environment = "{env}"' not in tfvars:
            raise SystemExit(f"envs/{env}.tfvars must set environment = {env!r}")
    print("backend.hcl and env tfvars look right")


if __name__ == "__main__":
    main()
