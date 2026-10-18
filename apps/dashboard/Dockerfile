# syntax=docker/dockerfile:1.7
#
# Build from apps/dashboard (not on the 1 GB control Droplet):
#   docker build -t aerodeck/dashboard:dev .
#
# Run on the control Droplet so the server can reach the API on 127.0.0.1:8000.
# Procedure: docs/runbooks/dashboard-console.md

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -g 10001 -S aerodeck \
    && adduser -u 10001 -S aerodeck -G aerodeck
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
USER 10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Docker sets HOSTNAME to the machine name. Next.js then refuses to listen on
# 127.0.0.1. Set it in the shell so the value wins over Docker's injection.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
