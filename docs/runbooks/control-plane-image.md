# Control-plane image (DigitalOcean Container Registry)

CI builds `apps/control-plane` and `apps/dashboard` on every pull request that
touches them. A push to `main` publishes the images to **DigitalOcean Container
Registry**, tagged with the git SHA (immutable) and a floating `main` tag. Pull
requests never push `main`. Workflows:
`.github/workflows/control-plane-image.yml` and
`.github/workflows/dashboard-image.yml`.

Do not publish to GHCR. DigitalOcean only.

## Tags

| Tag | When | Use |
| --- | ---- | --- |
| `<git sha>` | every successful push to `main` | pin a Droplet to one build |
| `main` | same push, floating | default `control_plane_image` in Terraform |

Image names:

```
registry.digitalocean.com/<registry>/control-plane:<tag>
registry.digitalocean.com/<registry>/dashboard:<tag>
```

Default registry name is `aerodeck`. Override with repo variable `DOCR_NAME`.

The platform stack writes that reference to
`/etc/aerodeck/control-plane-image` on the Droplet. It does **not** log in to
the registry or start the container (no token on the host).

Because the DigitalOcean Container Registry Starter tier stores at most ~5
images across the registry, CI runs
`apps/control-plane/scripts/prune_docr_images.py` before (`--keep 1`) and after
(`--keep 2`) pushing so each repository keeps `main` plus the newest SHA digest
and triggers online garbage collection (`/v2/registry/{registry}/garbage-collection`)
when older digests are removed.

## Operator setup (once)

Account, token, and registry click-by-click:
[digitalocean-account.md](digitalocean-account.md).

1. In DigitalOcean: **Container Registry** → create `aerodeck` (Starter is
   enough). One registry per account; it is not per environment.
2. Repo secret `DOCR_TOKEN` (dedicated token with **Container Registry → Read &
   Write** scope) or `DIGITALOCEAN_TOKEN` (if it already includes Container
   Registry Write scope). The workflows prefer `DOCR_TOKEN` and fall back to
   `DIGITALOCEAN_TOKEN`.
3. Optional repo **variable** `DOCR_NAME` if the registry is not `aerodeck`.

Until the token is set, the push job **skips** and pull requests stay green.
The build job still compiles the Dockerfile.

## Local build (no push)

```bash
docker build -f apps/control-plane/Dockerfile -t aerodeck/control-plane:dev .
```

## After a push to main, verify

1. Actions → **Control plane image** is green.
2. DigitalOcean → Container Registry → `control-plane` has `<sha>` and `main`.
3. `terraform output control_plane_image` is
   `registry.digitalocean.com/aerodeck/control-plane:main` (or a SHA tag you
   set in tfvars).

Pin an environment to a SHA by setting `control_plane_image` in
`packages/iac-engine/envs/<env>.tfvars` and applying from CI
([iac-apply.md](iac-apply.md)). Do not `terraform apply` from a laptop.

## Pull on the Droplet

The Droplet needs a registry login (operator or a later workflow), then:

```bash
image=$(cat /etc/aerodeck/control-plane-image)
docker pull "$image"
```

Start the API and worker: [startup-control-plane.md](startup-control-plane.md).

## Related

- #33 — this runbook.
- #32 — Droplet + Postgres + Redis ([platform-runtime.md](platform-runtime.md)).
- Local image: [control-plane.md](control-plane.md) Docker section.
