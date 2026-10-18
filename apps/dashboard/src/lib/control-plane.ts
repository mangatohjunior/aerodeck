import type { Project } from "./types";

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
