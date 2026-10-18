import type { Project, Sandbox } from "./types";

const CLIENT_ID_MAX = 128;
const CLIENT_SECRET_MAX = 512;
const PAGE_LIMIT = 200;
const REFRESH_SKEW_SECONDS = 30;

export type ControlPlaneConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export type ControlPlaneProjectPage = {
  items: Project[];
  total: number;
  limit: number;
  offset: number;
};

export type ControlPlaneSandboxPage = {
  items: Sandbox[];
  total: number;
};

type CachedToken = {
  accessToken: string;
  refreshAtMs: number;
};

type ListOptions = {
  fetch?: typeof fetch;
  now?: () => number;
};

const tokens = new Map<string, CachedToken>();

export class ControlPlaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

export function clearControlPlaneTokenCache(): void {
  tokens.clear();
}

export function readControlPlaneConfig(
  env: Record<string, string | undefined> = process.env,
): ControlPlaneConfig | null {
  const baseUrl = normalizeBaseUrl(env.CONTROL_PLANE_URL);
  const clientId = env.CONTROL_PLANE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.CONTROL_PLANE_CLIENT_SECRET ?? "";
  if (!baseUrl || clientId.length === 0 || clientSecret.length === 0) {
    return null;
  }
  if (clientId.length > CLIENT_ID_MAX || clientSecret.length > CLIENT_SECRET_MAX) {
    return null;
  }
  return { baseUrl, clientId, clientSecret };
}

export async function listControlPlaneProjects(
  config: ControlPlaneConfig,
  options: ListOptions = {},
): Promise<ControlPlaneProjectPage> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects?limit=${PAGE_LIMIT}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new ControlPlaneError(
      `control plane projects request failed (${response.status})`,
    );
  }
  return parseProjectPage(await response.json());
}

const SANDBOX_PAGE_CAP = 20;

export async function listControlPlaneSandboxes(
  config: ControlPlaneConfig,
  options: ListOptions = {},
): Promise<ControlPlaneSandboxPage> {
  const projects = await listControlPlaneProjects(config, options);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const items: Sandbox[] = [];
  for (const project of projects.items) {
    const page = await listProjectSandboxes(config, project.id, accessToken, fetchImpl);
    items.push(...page);
  }
  return { items, total: items.length };
}

const DEPLOYMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDeploymentLogId(deploymentId: string): boolean {
  return DEPLOYMENT_ID.test(deploymentId);
}

export async function openControlPlaneDeploymentLogs(
  config: ControlPlaneConfig,
  deploymentId: string,
  options: ListOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  if (!isDeploymentLogId(deploymentId)) {
    throw new ControlPlaneError("control plane deployment id was not a uuid");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`,
    {
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok || !response.body) {
    throw new ControlPlaneError(
      `control plane deployment logs request failed (${response.status})`,
    );
  }
  return response.body;
}

export type ControlPlaneUser = {
  id: string;
  email: string;
  created_at: string;
};

export async function registerControlPlaneUser(
  config: ControlPlaneConfig,
  email: string,
  password: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(`${config.baseUrl}/api/v1/console-users`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (response.status === 409) {
    throw new ControlPlaneError("control plane register conflict (409)");
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane register request failed (${response.status})`);
  }
  return parseControlPlaneUser(await response.json());
}

export async function authenticateControlPlaneUser(
  config: ControlPlaneConfig,
  email: string,
  password: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(`${config.baseUrl}/api/v1/console-users/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (response.status === 401 && (await errorCode(response)) === "invalid_credentials") {
    throw new ControlPlaneError("control plane login rejected (401)");
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane login request failed (${response.status})`);
  }
  return parseControlPlaneUser(await response.json());
}

async function listProjectSandboxes(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Sandbox[]> {
  const items: Sandbox[] = [];
  let offset = 0;
  let total = 0;
  for (let page = 0; page < SANDBOX_PAGE_CAP; page += 1) {
    const response = await fetchImpl(
      `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/sandboxes?limit=${PAGE_LIMIT}&offset=${offset}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new ControlPlaneError(
        `control plane sandboxes request failed (${response.status})`,
      );
    }
    const parsed = parseSandboxPage(await response.json());
    items.push(...parsed.items);
    total = parsed.total;
    if (parsed.items.length === 0 || items.length >= total) {
      break;
    }
    offset += parsed.items.length;
  }
  return items;
}

function normalizeBaseUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    return null;
  }
  return url.origin;
}

async function accessTokenFor(
  config: ControlPlaneConfig,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<string> {
  const key = `${config.baseUrl}\n${config.clientId}`;
  const currentMs = now();
  const cached = tokens.get(key);
  if (cached && cached.refreshAtMs > currentMs) {
    return cached.accessToken;
  }

  const response = await fetchImpl(`${config.baseUrl}/api/v1/auth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ControlPlaneError(
      `control plane token request failed (${response.status})`,
    );
  }

  const issued = parseTokenBody(await response.json());
  tokens.set(key, {
    accessToken: issued.accessToken,
    refreshAtMs: currentMs + Math.max(0, issued.expiresIn - REFRESH_SKEW_SECONDS) * 1000,
  });
  return issued.accessToken;
}

type IssuedToken = {
  accessToken: string;
  expiresIn: number;
};

function parseTokenBody(body: unknown): IssuedToken {
  if (!body || typeof body !== "object") {
    throw new ControlPlaneError("control plane token response was not a bearer");
  }
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  const expiresIn = record.expires_in;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new ControlPlaneError("control plane token response was not a bearer");
  }
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0) {
    throw new ControlPlaneError("control plane token response was not a bearer");
  }
  return { accessToken, expiresIn };
}

function parseProjectPage(body: unknown): ControlPlaneProjectPage {
  if (!body || typeof body !== "object") {
    throw new ControlPlaneError("control plane projects response was not a page");
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new ControlPlaneError("control plane projects response was not a page");
  }
  const items = record.items.map(parseProject);
  return {
    items,
    total: typeof record.total === "number" ? record.total : items.length,
    limit: typeof record.limit === "number" ? record.limit : PAGE_LIMIT,
    offset: typeof record.offset === "number" ? record.offset : 0,
  };
}

function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane projects response was not a page");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    throw new ControlPlaneError("control plane projects response was not a page");
  }
  const description = row.description;
  if (description !== null && typeof description !== "string") {
    throw new ControlPlaneError("control plane projects response was not a page");
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SANDBOX_STATUSES = new Set(["pending", "running", "stopped", "expired"]);

function parseSandboxPage(body: unknown): { items: Sandbox[]; total: number } {
  if (!body || typeof body !== "object") {
    throw new ControlPlaneError("control plane sandboxes response was not a page");
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new ControlPlaneError("control plane sandboxes response was not a page");
  }
  const items = record.items.map(parseSandbox);
  return {
    items,
    total: typeof record.total === "number" ? record.total : items.length,
  };
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : "";
  } catch {
    return "";
  }
}

function parseControlPlaneUser(body: unknown): ControlPlaneUser {
  if (!body || typeof body !== "object") {
    throw new ControlPlaneError("control plane register response was not a user");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.email !== "string" || typeof row.created_at !== "string") {
    throw new ControlPlaneError("control plane register response was not a user");
  }
  return { id: row.id, email: row.email, created_at: row.created_at };
}

function parseSandbox(value: unknown): Sandbox {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane sandboxes response was not a page");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.image !== "string" ||
    typeof row.vcpu !== "number" ||
    typeof row.memory_mib !== "number" ||
    typeof row.ttl_seconds !== "number" ||
    typeof row.status !== "string" ||
    !SANDBOX_STATUSES.has(row.status) ||
    typeof row.expires_at !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new ControlPlaneError("control plane sandboxes response was not a page");
  }
  return {
    id: row.id,
    project_id: row.project_id,
    image: row.image,
    vcpu: row.vcpu,
    memory_mib: row.memory_mib,
    ttl_seconds: row.ttl_seconds,
    status: row.status as Sandbox["status"],
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}
