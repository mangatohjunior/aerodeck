# Control plane

The FastAPI service in `apps/control-plane`. Python 3.12, PostgreSQL (asyncpg
in production, SQLite in unit tests), Redis + Celery for long-running jobs.

## First-time setup

```bash
cd apps/control-plane
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
```

Edit `.env`:

- `AERODECK_AUTH_SIGNING_KEY` — at least 32 random characters.
- `AERODECK_AUTH_CLIENTS` — `client_id` to SHA-256 hex of the secret. The
  example maps `local-cli` to secret `local-dev-secret`.
- `AERODECK_DATABASE_URL` — `postgresql+asyncpg://user:pass@host:5432/aerodeck`.
- `AERODECK_REDIS_URL` — `redis://localhost:6379/0`.

Generate a client secret and its digest:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" <secret>
```

## Database

```bash
cd apps/control-plane
alembic upgrade head
alembic current          # expect 0004 (head)
```

Without `AERODECK_DATABASE_URL`, `/readyz` reports `database: skipped` and
project/environment routes return `503 database_unavailable`.

## Run the API

```bash
cd apps/control-plane
uvicorn main:app --reload --port 8000
```

Probes (no auth): `GET /healthz`, `GET /readyz`.

Issue a token, then mutate:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"client_id":"local-cli","client_secret":"local-dev-secret"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://127.0.0.1:8000/api/v1/projects \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"slug":"payments","name":"Payments"}'
```

Reads (`GET /api/v1/projects`) do not require a token. `POST`/`PUT`/`PATCH`/`DELETE`
do. `GET /api/v1/jobs/{id}` and `GET /api/v1/edge/traefik` require a token.
Traefik routes: [edge-routing.md](edge-routing.md).

## Run the worker

The API process never runs Celery. Same image, different command:

```bash
cd apps/control-plane
celery -A app.worker worker --queues aerodeck --loglevel INFO
```

On Windows use `--pool solo` if the default pool fails to start.

Enqueue work, then poll:

```bash
curl -s -X POST \
  http://127.0.0.1:8000/api/v1/projects/<project-id>/environments/<env-id>/provision \
  -H "authorization: Bearer $TOKEN"

curl -s http://127.0.0.1:8000/api/v1/jobs/<job-id> \
  -H "authorization: Bearer $TOKEN"
```

Until the IaC engine is wired (#5/#6), the worker's `NoopProvisioner` succeeds
and reports `changed: false`.

Without `AERODECK_REDIS_URL`, job routes return `503 queue_unavailable` and
`/readyz` reports `queue: skipped`.

## Tests

```bash
cd apps/control-plane
pytest -q
# Optional, against a real Postgres:
AERODECK_TEST_DATABASE_URL=postgresql+asyncpg://aerodeck:aerodeck@localhost:5432/aerodeck pytest -q
```

CI runs both legs plus `alembic upgrade / downgrade / upgrade` on PostgreSQL 16
(`.github/workflows/control-plane-tests.yml`).

## Docker

```bash
docker build -t aerodeck/control-plane:dev apps/control-plane
docker run --rm -p 8000:8000 \
  -e AERODECK_ENV=dev \
  -e AERODECK_AUTH_SIGNING_KEY=... \
  -e AERODECK_DATABASE_URL=... \
  -e AERODECK_REDIS_URL=... \
  aerodeck/control-plane:dev

# Worker from the same image:
docker run --rm \
  -e AERODECK_AUTH_SIGNING_KEY=... \
  -e AERODECK_REDIS_URL=... \
  aerodeck/control-plane:dev \
  celery -A app.worker worker --queues aerodeck --loglevel INFO
```
