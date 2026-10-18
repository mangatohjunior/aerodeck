# Start and stop Droplets from CI

Turn the platform Droplets on or off from GitHub Actions. This is manual, on
`main` only, and never runs on a pull request.

Workflow: `.github/workflows/droplet-power.yml`.
Helper: `packages/iac-engine/scripts/droplet_power.py`.

Powering a Droplet off does **not** stop its bill. DigitalOcean keeps the
disk, CPU, memory, and IP reserved until the Droplet is destroyed. Destroy
is a different workflow ([iac-destroy.md](iac-destroy.md)). Postgres, Redis,
Spaces, and the container registry keep billing either way.

## What runs when

| Event | Start / stop |
| ----- | ------------ |
| Pull request | Never |
| Push | Never |
| `workflow_dispatch` on `main` | The selected environment. `prod` waits on the GitHub `production` environment |
| Any other branch | Refused |

## How to run it

1. Actions → **Droplet power** → **Run workflow**.
2. Branch: `main`.
3. Action: `start` or `stop`.
4. Environment: `dev` unless you mean another stack.

`stop` shuts down `aerodeck-<env>-edge`, then `aerodeck-<env>-control`.
`start` powers on control, then edge. A Droplet that is already on or off is
left alone. The lookup uses the `env:<environment>` tag and those exact names,
so another Droplet in the account is not touched.

After `start`, containers set to restart come back. The dev console can take
a minute before `https://dev.app.aero-deck.app` answers.
