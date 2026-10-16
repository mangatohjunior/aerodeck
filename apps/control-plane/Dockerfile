# syntax=docker/dockerfile:1.7
#
# Build from the repository root:
#   docker build -f apps/control-plane/Dockerfile -t aerodeck/control-plane:dev .
#
# The worker image includes Terraform and packages/iac-engine/stacks/tenant (#34).

ARG PYTHON_VERSION=3.12
ARG TERRAFORM_VERSION=1.9.8

# --------------------------------------------------------------------------- #
# Stage 1: build wheels in an isolated venv
# --------------------------------------------------------------------------- #
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY apps/control-plane/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install -r requirements.txt

# --------------------------------------------------------------------------- #
# Stage 2: minimal runtime
# --------------------------------------------------------------------------- #
FROM python:${PYTHON_VERSION}-slim AS runtime

ARG TERRAFORM_VERSION

LABEL org.opencontainers.image.title="aerodeck-control-plane" \
      org.opencontainers.image.description="AeroDeck declarative GitOps control plane (FastAPI)" \
      org.opencontainers.image.source="https://github.com/mangatohjunior/aerodeck"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    AERODECK_ENV=production \
    PORT=8000 \
    AERODECK_IAC_ENGINE_ROOT=/opt/aerodeck/iac-engine/stacks/tenant

RUN groupadd --system --gid 10001 aerodeck \
    && useradd --system --uid 10001 --gid aerodeck --home-dir /app --no-create-home aerodeck

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
      -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && chmod 755 /usr/local/bin/terraform \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=aerodeck:aerodeck apps/control-plane /app
COPY --chown=aerodeck:aerodeck packages/iac-engine/backend.hcl /opt/aerodeck/iac-engine/backend.hcl
COPY --chown=aerodeck:aerodeck packages/iac-engine/stacks/tenant /opt/aerodeck/iac-engine/stacks/tenant

USER aerodeck

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*", "--no-server-header"]
