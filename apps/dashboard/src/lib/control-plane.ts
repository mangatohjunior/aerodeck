import type { Deployment, DeploymentStatus, EnvironmentOption, Project, Sandbox } from "./types";

const CLIENT_ID_MAX = 128;
const CLIENT_SECRET_MAX = 512;
const PAGE_LIMIT = 200;
const PAGE_CAP = 20;
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
  readonly status?: number;
  /** Set when a deployment row was created but a later step (e.g. provision) failed. */
  readonly deploymentId?: string;

  constructor(
    message: string,
    status?: number,
    deploymentId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ControlPlaneError";
    this.status = status;
    this.deploymentId = deploymentId;
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
  const items: Project[] = [];
  let offset = 0;
  let total = 0;
  let limit = PAGE_LIMIT;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const response = await fetchImpl(
      `${config.baseUrl}/api/v1/projects?limit=${PAGE_LIMIT}&offset=${offset}`,
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
        response.status,
      );
    }
    const parsed = parseProjectPage(await response.json());
    items.push(...parsed.items);
    total = parsed.total;
    limit = parsed.limit;
    if (parsed.items.length === 0 || items.length >= total) {
      break;
    }
    offset += parsed.items.length;
  }
  if (items.length < total) {
    throw new ControlPlaneError(
      `control plane projects list exceeded page cap (${PAGE_CAP})`,
    );
  }
  return { items, total, limit, offset: 0 };
}

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

const CONTROL_PLANE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isControlPlaneUuid(value: string): boolean {
  return CONTROL_PLANE_UUID.test(value);
}

export async function openControlPlaneDeploymentLogs(
  config: ControlPlaneConfig,
  deploymentId: string,
  options: ListOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  if (!isControlPlaneUuid(deploymentId)) {
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
  if (response.status === 404) {
    throw new ControlPlaneError("control plane deployment logs were not found (404)", 404);
  }
  if (!response.ok || !response.body) {
    throw new ControlPlaneError(
      `control plane deployment logs request failed (${response.status})`,
      response.status,
    );
  }
  return response.body;
}

async function postDeploymentStatus(
  config: ControlPlaneConfig,
  deploymentId: string,
  outcome: "succeeded" | "failed",
  options: ListOptions = {},
): Promise<Deployment> {
  if (!isControlPlaneUuid(deploymentId)) {
    throw new ControlPlaneError("control plane deployment id was not a uuid");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/deployments/${encodeURIComponent(deploymentId)}/${outcome}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    throw new ControlPlaneError("control plane deployment was not found (404)", 404);
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane deployment request failed (${response.status})`, response.status);
  }
  return parseDeployment(await response.json());
}

export function succeedControlPlaneDeployment(
  config: ControlPlaneConfig,
  deploymentId: string,
  options: ListOptions = {},
): Promise<Deployment> {
  return postDeploymentStatus(config, deploymentId, "succeeded", options);
}

export function failControlPlaneDeployment(
  config: ControlPlaneConfig,
  deploymentId: string,
  options: ListOptions = {},
): Promise<Deployment> {
  return postDeploymentStatus(config, deploymentId, "failed", options);
}

export type ControlPlaneUser = {
  id: string;
  email: string;
  created_at: string;
};

export function registerControlPlaneUser(
  config: ControlPlaneConfig,
  email: string,
  password: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  return postControlPlaneUser(
    config,
    "/api/v1/console-users",
    { email, password },
    "control plane register request failed",
    options,
    (response) => {
      if (response.status === 409) {
        throw new ControlPlaneError("control plane register conflict (409)", 409);
      }
    },
  );
}

export function authenticateControlPlaneUser(
  config: ControlPlaneConfig,
  email: string,
  password: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  return postControlPlaneUser(
    config,
    "/api/v1/console-users/login",
    { email, password },
    "control plane login request failed",
    options,
    async (response) => {
      if (response.status === 401 && (await errorCode(response)) === "invalid_credentials") {
        throw new ControlPlaneError("control plane login rejected (401)", 401);
      }
    },
  );
}

export function linkControlPlaneGoogleUser(
  config: ControlPlaneConfig,
  email: string,
  subject: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  return postControlPlaneUser(
    config,
    "/api/v1/console-users/google",
    { email, subject },
    "control plane google link request failed",
    options,
    (response) => {
      if (response.status === 409) {
        throw new ControlPlaneError("control plane google link conflict (409)", 409);
      }
    },
  );
}

export async function createControlPlaneSession(
  config: ControlPlaneConfig,
  userId: string,
  options: ListOptions = {},
): Promise<{ token: string; user: ControlPlaneUser }> {
  const response = await authorizedPost(config, "/api/v1/console-sessions", { user_id: userId }, options);
  if (response.status === 404) {
    throw new ControlPlaneError("control plane session user was not found (404)", 404);
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane session request failed (${response.status})`, response.status);
  }
  const body = (await response.json()) as { token?: unknown; user?: unknown };
  if (typeof body.token !== "string" || body.token.length === 0) {
    throw new ControlPlaneError("control plane session response was not a session");
  }
  return { token: body.token, user: parseControlPlaneUser(body.user) };
}

export async function readControlPlaneSession(
  config: ControlPlaneConfig,
  token: string,
  options: ListOptions = {},
): Promise<ControlPlaneUser> {
  const response = await authorizedPost(config, "/api/v1/console-sessions/resolve", { token }, options);
  if (response.status === 404) {
    throw new ControlPlaneError("control plane session was not found (404)", 404);
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane session request failed (${response.status})`, response.status);
  }
  return parseControlPlaneUser(await response.json());
}

export async function revokeControlPlaneSession(
  config: ControlPlaneConfig,
  token: string,
  options: ListOptions = {},
): Promise<void> {
  const response = await authorizedPost(config, "/api/v1/console-sessions/logout", { token }, options);
  if (response.ok) {
    return;
  }
  throw new ControlPlaneError(`control plane session logout failed (${response.status})`, response.status);
}

const DEPLOYMENT_STATUSES = new Set<DeploymentStatus>(["queued", "running", "succeeded", "failed"]);

export async function listControlPlaneDeployments(
  config: ControlPlaneConfig,
  options: ListOptions = {},
): Promise<Deployment[]> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const items: Deployment[] = [];
  let offset = 0;
  let total = 0;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const response = await fetchImpl(
      `${config.baseUrl}/api/v1/deployments?limit=${PAGE_LIMIT}&offset=${offset}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new ControlPlaneError(`control plane deployments request failed (${response.status})`, response.status);
    }
    const parsed = parseDeploymentPage(await response.json());
    items.push(...parsed.items);
    total = parsed.total;
    offset += parsed.items.length;
    if (parsed.items.length === 0 || items.length >= total) {
      break;
    }
  }
  if (items.length < total) {
    throw new ControlPlaneError(
      `control plane deployments list exceeded page cap (${PAGE_CAP})`,
    );
  }
  return items;
}

export async function createControlPlaneDeployment(
  config: ControlPlaneConfig,
  repoUrl: string,
  options: ListOptions & { projectId?: string; environmentId?: string } = {},
): Promise<Deployment> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const projectId = options.projectId;
  const environmentId = options.environmentId;
  const hasProject = typeof projectId === "string" && projectId.length > 0;
  const hasEnvironment = typeof environmentId === "string" && environmentId.length > 0;
  if (hasProject !== hasEnvironment) {
    throw new ControlPlaneError(
      "projectId and environmentId must both be set or both omitted",
    );
  }
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const body: Record<string, string> = { repo_url: repoUrl };
  if (hasProject && hasEnvironment) {
    body.project_id = projectId;
    body.environment_id = environmentId;
  }
  const response = await fetchImpl(`${config.baseUrl}/api/v1/deployments`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 422) {
    throw new ControlPlaneError("control plane deployment rejected (422)", 422);
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane deployment request failed (${response.status})`, response.status);
  }
  return parseDeployment(await response.json());
}

export async function listControlPlaneEnvironments(
  config: ControlPlaneConfig,
  options: ListOptions = {},
): Promise<EnvironmentOption[]> {
  const projects = await listControlPlaneProjects(config, options);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const items: EnvironmentOption[] = [];
  for (const project of projects.items) {
    const page = await listProjectEnvironments(config, project, accessToken, fetchImpl);
    items.push(...page);
  }
  return items;
}

async function discardResponseBody(response: Response): Promise<void> {
  await response.body?.cancel();
}

/** Existence check before create+provision. UI listing uses listControlPlaneEnvironments. */
export async function getControlPlaneEnvironment(
  config: ControlPlaneConfig,
  projectId: string,
  environmentId: string,
  options: ListOptions = {},
): Promise<void> {
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(environmentId)) {
    throw new ControlPlaneError("control plane environment ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane environment was not found (404)", 404);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane environment request failed (${response.status})`,
      response.status,
    );
  }
  await discardResponseBody(response);
}

export async function provisionControlPlaneEnvironment(
  config: ControlPlaneConfig,
  projectId: string,
  environmentId: string,
  deploymentId: string,
  options: ListOptions = {},
): Promise<void> {
  if (
    !isControlPlaneUuid(projectId) ||
    !isControlPlaneUuid(environmentId) ||
    !isControlPlaneUuid(deploymentId)
  ) {
    throw new ControlPlaneError("control plane provision ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/provision`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ deployment_id: deploymentId }),
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane provision target was not found (404)", 404);
  }
  if (response.status === 503) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane provision queue unavailable (503)", 503);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane provision request failed (${response.status})`, response.status);
  }
  await discardResponseBody(response);
}

export async function createControlPlaneDeploymentAndProvision(
  config: ControlPlaneConfig,
  input: { repoUrl: string; projectId: string; environmentId: string },
  options: ListOptions = {},
): Promise<Deployment> {
  // Resolve the environment first so a bad target never creates a deployment row.
  await getControlPlaneEnvironment(config, input.projectId, input.environmentId, options);
  const deployment = await createControlPlaneDeployment(config, input.repoUrl, {
    ...options,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  try {
    await provisionControlPlaneEnvironment(
      config,
      input.projectId,
      input.environmentId,
      deployment.id,
      options,
    );
  } catch (cause) {
    // Deployment exists; attach its id for the console error payload (do not navigate —
    // opening logs before a seed line would hit stub Done).
    if (cause instanceof ControlPlaneError) {
      throw new ControlPlaneError(cause.message, cause.status, deployment.id, { cause });
    }
    const message =
      cause instanceof Error ? cause.message : "control plane provision request failed";
    throw new ControlPlaneError(message, 502, deployment.id, { cause });
  }
  return deployment;
}

export async function getControlPlaneDeployment(
  config: ControlPlaneConfig,
  deploymentId: string,
  options: ListOptions = {},
): Promise<Deployment> {
  if (!isControlPlaneUuid(deploymentId)) {
    throw new ControlPlaneError("control plane deployment id was not a uuid");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/deployments/${encodeURIComponent(deploymentId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    throw new ControlPlaneError("control plane deployment was not found (404)", 404);
  }
  if (!response.ok) {
    throw new ControlPlaneError(`control plane deployment request failed (${response.status})`, response.status);
  }
  return parseDeployment(await response.json());
}

async function listProjectEnvironments(
  config: ControlPlaneConfig,
  project: Project,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<EnvironmentOption[]> {
  return listPaginatedProjectCollection(
    config,
    project.id,
    accessToken,
    fetchImpl,
    "environments",
    (body) => {
      if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
        throw new ControlPlaneError("control plane environments response was not a page");
      }
      const record = body as { items: unknown[]; total?: unknown };
      const pageItems = record.items.map((row) => parseEnvironmentOption(row, project));
      return {
        items: pageItems,
        total: typeof record.total === "number" ? record.total : pageItems.length,
      };
    },
  );
}

function parseEnvironmentOption(
  value: unknown,
  project: Pick<Project, "id" | "slug" | "name">,
): EnvironmentOption {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane environments response was not a page");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string" ||
    typeof row.kind !== "string" ||
    typeof row.region !== "string"
  ) {
    throw new ControlPlaneError("control plane environments response was not a page");
  }
  if (row.project_id !== project.id) {
    throw new ControlPlaneError("control plane environments response was not a page");
  }
  return {
    id: row.id,
    project_id: row.project_id,
    project_slug: project.slug,
    project_name: project.name,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    region: row.region,
  };
}

async function listProjectSandboxes(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<Sandbox[]> {
  return listPaginatedProjectCollection(
    config,
    projectId,
    accessToken,
    fetchImpl,
    "sandboxes",
    parseSandboxPage,
  );
}

async function listPaginatedProjectCollection<T>(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  resource: "sandboxes" | "environments",
  parsePage: (body: unknown) => { items: T[]; total: number },
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  let total = 0;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const response = await fetchImpl(
      `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/${resource}?limit=${PAGE_LIMIT}&offset=${offset}`,
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
        `control plane ${resource} request failed (${response.status})`,
        response.status,
      );
    }
    const parsed = parsePage(await response.json());
    items.push(...parsed.items);
    total = parsed.total;
    if (parsed.items.length === 0 || items.length >= total) {
      break;
    }
    offset += parsed.items.length;
  }
  if (items.length < total) {
    throw new ControlPlaneError(
      `control plane ${resource} list exceeded page cap (${PAGE_CAP})`,
    );
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
      response.status,
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

async function authorizedPost(
  config: ControlPlaneConfig,
  path: string,
  body: Record<string, string>,
  options: ListOptions,
): Promise<Response> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  return fetchImpl(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

async function postControlPlaneUser(
  config: ControlPlaneConfig,
  path: string,
  body: Record<string, string>,
  failure: string,
  options: ListOptions,
  reject: (response: Response) => void | Promise<void>,
): Promise<ControlPlaneUser> {
  const response = await authorizedPost(config, path, body, options);
  await reject(response);
  if (!response.ok) {
    throw new ControlPlaneError(`${failure} (${response.status})`, response.status);
  }
  return parseControlPlaneUser(await response.json());
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : "";
  } catch {
    return "";
  }
}

function parseDeploymentPage(body: unknown): { items: Deployment[]; total: number } {
  if (!body || typeof body !== "object") {
    throw new ControlPlaneError("control plane deployments response was not a page");
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new ControlPlaneError("control plane deployments response was not a page");
  }
  return {
    items: record.items.map(parseDeployment),
    total: typeof record.total === "number" ? record.total : record.items.length,
  };
}

function optionalUuidField(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && isControlPlaneUuid(value)) {
    return value;
  }
  throw new ControlPlaneError("control plane deployment response was not a deployment");
}

function deploymentLinkFields(
  projectId: string | null | undefined,
  environmentId: string | null | undefined,
): Pick<Deployment, "project_id" | "environment_id"> | Record<string, never> {
  if (projectId === undefined && environmentId === undefined) {
    return {};
  }
  if (projectId === null && environmentId === null) {
    return { project_id: null, environment_id: null };
  }
  if (typeof projectId === "string" && typeof environmentId === "string") {
    return { project_id: projectId, environment_id: environmentId };
  }
  throw new ControlPlaneError("control plane deployment response was not a deployment");
}

function parseDeployment(value: unknown): Deployment {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane deployment response was not a deployment");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.repo_url !== "string" ||
    typeof row.owner !== "string" ||
    typeof row.repo !== "string" ||
    typeof row.started_at !== "string" ||
    typeof row.status !== "string" ||
    !DEPLOYMENT_STATUSES.has(row.status as DeploymentStatus)
  ) {
    throw new ControlPlaneError("control plane deployment response was not a deployment");
  }
  return {
    id: row.id,
    repo_url: row.repo_url,
    owner: row.owner,
    repo: row.repo,
    ...deploymentLinkFields(optionalUuidField(row.project_id), optionalUuidField(row.environment_id)),
    started_at: row.started_at,
    status: row.status as DeploymentStatus,
  };
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
