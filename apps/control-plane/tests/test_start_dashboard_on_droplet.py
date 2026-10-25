"""Unit tests for start-dashboard-on-droplet.sh and self-hosted deploy job."""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "start-dashboard-on-droplet.sh"
)
WORKFLOW_PATH = REPO / ".github" / "workflows" / "dashboard-image.yml"


def test_start_dashboard_on_droplet_script_contract() -> None:
    text = SCRIPT_PATH.read_text(encoding="utf-8")
    assert text.startswith("#!/usr/bin/env bash\n")
    assert "set -euo pipefail" in text
    assert 'DASHBOARD_ENV="/etc/aerodeck/dashboard.env"' in text
    assert 'IMAGE_FILE="/etc/aerodeck/dashboard-image"' in text
    assert (
        'DEFAULT_IMAGE="registry.digitalocean.com/aerodeck/control-plane:dashboard-main"'
        in text
    )
    assert "docker login registry.digitalocean.com" in text
    assert 'docker pull "${DASHBOARD_IMAGE}"' in text
    assert 'docker tag "${DASHBOARD_IMAGE}" aerodeck/dashboard:dev' in text
    assert "--name aerodeck-dashboard --network host --restart unless-stopped" in text
    assert "http://127.0.0.1:3000/login" in text


def test_dashboard_workflow_self_hosted_deploy_job() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "name: deploy to control Droplet" in workflow
    assert "runs-on: self-hosted" in workflow
    assert "vars.DEPLOY_DASHBOARD_SELF_HOSTED == 'true'" in workflow
    assert "vars.CONTROL_DROPLET_HOST != ''" in workflow
    assert "start-dashboard-on-droplet.sh" in workflow
