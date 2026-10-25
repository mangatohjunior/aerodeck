import { isControlPlaneUuid } from "@/lib/control-plane-uuid";
import type { ProjectRoute, RouteDnsRecord } from "@/lib/types";

export const ROUTE_HOSTNAME_MAX = 253;
export const ROUTE_BACKEND_HOST_MAX = 253;
export const ROUTE_PATH_PREFIX_MAX = 200;
export const DEFAULT_ROUTE_BACKEND_HOST = "10.41.0.2";
export const DEFAULT_ROUTE_BACKEND_PORT = 8080;
export const DEFAULT_ROUTE_PATH_PREFIX = "/";

/** Matches control-plane `Hostname` (lowercase DNS labels). */
export const ROUTE_HOSTNAME_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Matches control-plane `BackendHost`. */
const BACKEND_HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

export const ROUTE_PROJECT_ID_INVALID = "project_id must be a UUID.";
export const ROUTE_ENVIRONMENT_REQUIRED = "Select an environment.";
export const ROUTE_ENVIRONMENT_ID_INVALID = "environment_id must be a UUID.";
export const ROUTE_HOSTNAME_INVALID =
  "Enter a hostname with a domain (for example payments.aero-deck.app).";
export const ROUTE_BACKEND_HOST_INVALID =
  "Enter a backend host or private IPv4 (for example 10.10.1.20).";
export const ROUTE_BACKEND_PORT_INVALID = "Enter a backend port between 1 and 65535.";
export const ROUTE_PATH_PREFIX_INVALID =
  "Path prefix must start with / (1–200 characters).";
export const ROUTE_TARGET_NOT_FOUND = "Project or environment was not found.";
export const ROUTE_HOSTNAME_TAKEN = "That hostname is already routed.";
export const ROUTE_FIELDS_INVALID = "Route fields failed validation.";
export const ROUTE_DNS_NOT_FOUND = "DNS record was not found for this route.";
export const ROUTE_DNS_UNAVAILABLE =
  "DigitalOcean DNS is not configured on the control plane.";
export const ROUTE_DNS_FAILED =
  "DigitalOcean DNS rejected the record. Check the domain zone and token on the control plane.";
export const ROUTE_CERTIFICATE_NOT_FOUND = "Certificate was not found for this route.";
export const ROUTE_CERTIFICATE_ALREADY_ISSUED =
  "Certificate is already issued for this hostname.";
export const ROUTE_CERTIFICATE_UNAVAILABLE =
  "ACME / DNS-01 certificate issuer is not configured on the control plane.";
export const ROUTE_CERTIFICATE_ISSUE_FAILED =
  "Certificate issuance failed during the ACME DNS-01 challenge.";

export function isValidRouteHostname(hostname: string): boolean {
  return (
    hostname.length >= 1 &&
    hostname.length <= ROUTE_HOSTNAME_MAX &&
    hostname.includes(".") &&
    ROUTE_HOSTNAME_LABEL_PATTERN.test(hostname)
  );
}

export function isValidBackendHost(backendHost: string): boolean {
  return (
    backendHost.length >= 1 &&
    backendHost.length <= ROUTE_BACKEND_HOST_MAX &&
    BACKEND_HOST_PATTERN.test(backendHost)
  );
}

export function parseBackendPort(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 1 && raw <= 65535 ? raw : null;
  }
  const trimmed = raw.trim();
  if (!/^[0-9]{1,5}$/.test(trimmed)) {
    return null;
  }
  const port = Number(trimmed);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export function normalizeRoutePathPrefix(raw?: string): string | null {
  const trimmed = (raw ?? DEFAULT_ROUTE_PATH_PREFIX).trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > ROUTE_PATH_PREFIX_MAX ||
    !trimmed.startsWith("/") ||
    /\s/.test(trimmed)
  ) {
    return null;
  }
  if (trimmed.length > 1) {
    const stripped = trimmed.replace(/\/+$/, "");
    return stripped.length > 0 ? stripped : "/";
  }
  return trimmed;
}

export type RouteCreateFields = {
  projectId: string;
  environmentId: string;
  hostname: string;
  backendHost?: string;
  backendPort: string | number;
  pathPrefix?: string;
};

export type RouteCreateParsed = {
  projectId: string;
  environmentId: string;
  hostname: string;
  backendHost: string;
  backendPort: number;
  pathPrefix: string;
};

export type RouteCreateParseResult =
  | { ok: true; value: RouteCreateParsed }
  | { ok: false; error: string; code: string };

/** Client/BFF-shared validation for route creation. */
export function parseRouteCreateFields(input: RouteCreateFields): RouteCreateParseResult {
  const projectId = input.projectId.trim();
  if (!isControlPlaneUuid(projectId)) {
    return { ok: false, error: ROUTE_PROJECT_ID_INVALID, code: "invalid_project_id" };
  }
  const environmentId = input.environmentId.trim();
  if (environmentId.length === 0) {
    return { ok: false, error: ROUTE_ENVIRONMENT_REQUIRED, code: "missing_environment" };
  }
  if (!isControlPlaneUuid(environmentId)) {
    return { ok: false, error: ROUTE_ENVIRONMENT_ID_INVALID, code: "invalid_environment_id" };
  }
  const hostname = input.hostname.trim().toLowerCase();
  if (!isValidRouteHostname(hostname)) {
    return { ok: false, error: ROUTE_HOSTNAME_INVALID, code: "invalid_hostname" };
  }
  const rawBackendHost = typeof input.backendHost === "string" ? input.backendHost.trim() : "";
  const backendHost = rawBackendHost.length > 0 ? rawBackendHost : DEFAULT_ROUTE_BACKEND_HOST;
  if (!isValidBackendHost(backendHost)) {
    return { ok: false, error: ROUTE_BACKEND_HOST_INVALID, code: "invalid_backend_host" };
  }
  const backendPort = parseBackendPort(input.backendPort);
  if (backendPort === null) {
    return { ok: false, error: ROUTE_BACKEND_PORT_INVALID, code: "invalid_backend_port" };
  }
  const pathPrefix = normalizeRoutePathPrefix(input.pathPrefix);
  if (pathPrefix === null) {
    return { ok: false, error: ROUTE_PATH_PREFIX_INVALID, code: "invalid_path_prefix" };
  }
  return {
    ok: true,
    value: { projectId, environmentId, hostname, backendHost, backendPort, pathPrefix },
  };
}

/** Merge newly created routes at the front while deduplicating by route id. */
export function mergeRoutesById(
  incoming: readonly ProjectRoute[],
  current: readonly ProjectRoute[],
): ProjectRoute[] {
  const seen = new Set<string>();
  const merged: ProjectRoute[] = [];
  for (const row of [...incoming, ...current]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/** Strip trailing dot from DigitalOcean FQDN record data for operator display. */
export function formatDnsTarget(data: string): string {
  const trimmed = data.trim();
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

/** Operator-facing DNS record summary line (for example `CNAME app.aero-deck.app → edge.aero-deck.app (TTL 300s)`). */
export function formatDnsGuidance(record: RouteDnsRecord): string {
  const target = formatDnsTarget(record.data);
  return `${record.record_type} ${record.hostname} → ${target} (TTL ${record.ttl}s)`;
}

