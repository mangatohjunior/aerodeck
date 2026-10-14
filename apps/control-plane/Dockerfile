# syntax=docker/dockerfile:1.7
#
# AeroDeck Control Plane — multi-stage production image.
#   docker build -t aerodeck/control-plane:dev apps/control-plane
#   docker run --rm -p 8000:8000 -e AERODECK_ENV=dev aerodeck/control-plane:dev

ARG PYTHON_VERSION=3.12

# --------------------------------------------------------------------------- #
# Stage 1: build wheels in an isolated venv
# --------------------------------------------------------------------------- #
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Build toolchain only in the builder stage (asyncpg may need to compile).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install -r requirements.txt

# --------------------------------------------------------------------------- #
# Stage 2: minimal runtime
# --------------------------------------------------------------------------- #
FROM python:${PYTHON_VERSION}-slim AS runtime

LABEL org.opencontainers.image.title="aerodeck-control-plane" \
      org.opencontainers.image.description="AeroDeck declarative GitOps control plane (FastAPI)" \
      org.opencontainers.image.source="https://github.com/mangatohjunior/aerodeck"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    AERODECK_ENV=production \
    PORT=8000

# Non-root runtime user.
RUN groupadd --system --gid 10001 aerodeck \
    && useradd --system --uid 10001 --gid aerodeck --home-dir /app --no-create-home aerodeck

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=aerodeck:aerodeck . .

USER aerodeck

EXPOSE 8000

# Liveness check against the unauthenticated /healthz endpoint (no curl in slim image).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"

# Single uvicorn process per container; scale horizontally via the orchestrator.
# --proxy-headers / --forwarded-allow-ips trust the ingress/load balancer for scheme and client IP.
#
# The same image runs the job worker; override the command:
#   celery -A app.worker worker --queues aerodeck --loglevel INFO
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*", "--no-server-header"]
