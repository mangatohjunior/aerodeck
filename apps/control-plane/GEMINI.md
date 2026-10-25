# FastAPI Architecture Guardrails

These rules apply to every Python service under `apps/`. They are non-negotiable
unless an ADR in `docs/adr/` explicitly supersedes them. Keep in sync with
`.cursor/rules/fastapi-architecture.mdc`.

## 1. Runtime & tooling

- Python `>= 3.12`. Use `from __future__ import annotations` is NOT required; use native PEP 604/585 syntax (`str | None`, `list[int]`).
- FastAPI `>= 0.115`, Pydantic `>= 2.8, < 3`, `pydantic-settings` for configuration.
- ASGI server: `uvicorn[standard]`. Never bundle `gunicorn` configuration into application code; process management belongs to the container orchestrator.
- All dependencies are pinned with an upper bound (`>=x.y,<x+1`) in `requirements.txt`; a fully resolved lockfile is generated with `pip-compile`.

## 2. Project layout (mandatory)

```
apps/<service>/
├── main.py                 # ASGI entrypoint ONLY: create_app(), lifespan, no routes
├── app/
│   ├── api/
│   │   ├── deps.py         # shared Depends() providers (auth, pagination, session)
│   │   └── v1/
│   │       ├── router.py   # aggregates routers under /api/v1
│   │       └── routers/    # one module per resource (thin: parse -> service -> schema)
│   ├── core/
│   │   ├── config.py       # Settings(BaseSettings) — the ONLY place env vars are read
│   │   ├── db.py           # async engine, sessionmaker, get_session dependency
│   │   ├── logging.py      # structured logging setup
│   │   └── security.py     # auth primitives (hashing, token verification)
│   ├── models/             # SQLAlchemy 2.x ORM models (DeclarativeBase, Mapped[])
│   ├── schemas/            # Pydantic V2 request/response models
│   ├── repositories/       # persistence only; the only layer that queries models/
│   └── services/           # business logic; calls repositories, returns domain objects
├── tests/                  # pytest + httpx.AsyncClient; mirrors app/ structure
├── requirements.txt
└── Dockerfile
```

- Routers parse the request, call one service, and return a schema. They never import `models/` or `repositories/`, and they never contain business rules.
- Services own business rules. They call repositories and return domain objects. They never build `JSONResponse`s or read `os.environ`.
- Repositories are the only modules that query `models/`. Each method is `async def`, receives the injected session, and returns rows or domain objects to a service — never to a router.
- `main.py` must not define endpoints other than `/healthz` and `/readyz`. SSE streams and business routes live under `app/api/v1/routers/`.
- No module-level side effects (DB connections, HTTP clients) outside of `lifespan`.

## 3. Pydantic V2 — strict schemas

- Import from `pydantic` V2 only. **Forbidden:** `pydantic.v1`, `class Config:`, `@validator`, `@root_validator`, `.dict()`, `.json()`, `parse_obj()`, `orm_mode`.
- Use `model_config = ConfigDict(...)` and the V2 API: `@field_validator`, `@model_validator`, `.model_dump()`, `.model_validate()`.
- Every request schema MUST set `model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)`.
- Every response schema that is built from an ORM object MUST set `from_attributes=True`.
- Separate schemas per intent: `XCreate`, `XUpdate` (all fields optional), `XRead`. Never reuse an ORM model as a response type.
- Use `Annotated[T, Field(...)]` for constraints; never validate in route bodies what a schema can express.
- Settings live in a single `Settings(BaseSettings)` class with `SettingsConfigDict(env_prefix="AERODECK_", env_file=".env", extra="ignore")`, exposed via a cached `get_settings()` function and injected with `Depends`.

## 4. Async dependency injection for DB sessions

- Database access is **async only**: SQLAlchemy 2.x `AsyncEngine` + `async_sessionmaker` with `asyncpg` (PostgreSQL). Synchronous `Session`, `psycopg2`, or raw blocking drivers are forbidden in request paths.
- Exactly one session provider, in `app/core/db.py`:

```python
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

- Routes and services receive the session via `SessionDep = Annotated[AsyncSession, Depends(get_session)]`. Never instantiate sessions inside services, and never store sessions on `app.state` or in globals.
- Engine lifecycle (create/dispose) is managed in the `lifespan` context manager in `main.py`.
- Every DB-touching function is `async def` and awaits its I/O. Never call `asyncio.run()` or `.result()` inside the app.
- `expire_on_commit=False` on the sessionmaker to avoid implicit lazy loads after commit.

## 5. API conventions

- All business routes are mounted under `/api/v1`. Breaking changes require a new version prefix, never an in-place change.
- Every route declares `response_model`, `status_code`, and `tags`. Use `201` for creates, `204` with no body for deletes.
- Errors are raised as `HTTPException` or a domain exception mapped by a registered exception handler to a stable JSON shape: `{"detail": str, "code": str}`.
- Never return raw dicts from routes; return schema instances.
- Pagination is cursor- or offset-based via a shared `PaginationParams` dependency in `api/deps.py`.
- Health endpoints: `/healthz` (liveness, no dependencies) and `/readyz` (readiness, checks DB). Neither requires auth.

## 6. Security

- Secrets come from `Settings` only — never `os.environ[...]` scattered through the codebase, never hard-coded.
- CORS origins are an explicit allow-list from settings; `allow_origins=["*"]` is forbidden outside of `AERODECK_ENV=local`.
- Disable `/docs`, `/redoc`, and `/openapi.json` when `settings.env == "production"` unless explicitly re-enabled by a setting.
- Never log request bodies, tokens, or `Settings` dumps. Use the structured logger from `app/core/logging.py`.

## 7. Testing

- `pytest` + `pytest-asyncio` (`asyncio_mode = "auto"`) + `httpx.AsyncClient(transport=ASGITransport(app=app))`.
- Override `get_session` and `get_settings` with `app.dependency_overrides` in fixtures; never monkeypatch module globals.
- Each router module has a matching `tests/api/v1/test_<resource>.py`.

## 8. Celery / Redis task queue

- Long-running work (provision, reconcile, sandbox reap, certificate renew) is **never** awaited in an HTTP handler. Enqueue a Celery task and return `202` plus a job id.
- Broker and result backend are Redis. The URL comes from `Settings` only (`AERODECK_REDIS_URL`). Do not construct Redis clients inline.
- The API process does not run the worker. The orchestrator starts `celery -A app.worker worker` as a separate container from the same image.
- Tasks live in `app/tasks/`. They call services (and, through them, repositories). They never import routers or build HTTP responses.
- The worker reads the same `Settings` class. Task signatures take serialisable ids, not ORM objects or Pydantic models that embed secrets.
- Without a broker URL, job routes return `503 queue_unavailable`. Do not silently run work in-process in production.

## 9. Server-Sent Events for deployment logs

- Live deployment / job logs use **SSE** (`text/event-stream`), not WebSockets, unless an ADR supersedes this.
- Stream endpoints live under `/api/v1/` in a resource router. Never attach them to `main.py`.
- Yield `data: <line>\n\n` from an `async` generator. Set `Cache-Control: no-cache` and `X-Accel-Buffering: no` so proxies do not buffer the stream.
- Do not buffer the entire log in memory. Iterate the generator (Redis pub/sub, job event source, or a documented mock sequence).
- Until the worker publishes real events, a stub MAY emit a fixed mock sequence (`Initializing Terraform...`, `Provisioning K3s...`, `Done`) with the same event shape the dashboard will consume.
- Auth on the stream matches sibling job routes: an enrolled client token is required once the stub is replaced by real logs.
- The Next.js dashboard stays mock-first (see `apps/dashboard/GEMINI.md` and `.cursor/rules/nextjs-dashboard.mdc`) and must not `fetch` this endpoint until a Story explicitly wires it.
