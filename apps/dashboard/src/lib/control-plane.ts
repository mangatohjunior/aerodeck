import { isControlPlaneUuid } from "./control-plane-uuid";
import type {
  AcceptedJob,
  Deployment,
  DeploymentStatus,
  DnsRecordStatus,
  DnsRecordType,
  EnvironmentOption,
  JobKind,
  Project,
  ProjectRoute,
  ProvisionJob,
  ProvisionJobStatus,
  RouteCertificate,
  RouteCertificateStatus,
  RouteDnsRecord,
  Sandbox,
} from "./types";
import {
  DNS_RECORD_STATUSES,
  DNS_RECORD_TYPES,
  JOB_KINDS,
  PROVISION_JOB_STATUSES,
  ROUTE_CERTIFICATE_STATUSES,
} from "./types";

export { isControlPlaneUuid } from "./control-plane-uuid";

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
  /** Upstream error code when safely allowlisted (for example dns_record_failed). */
  readonly code?: string;

  constructor(
    message: string,
    status?: number,
    deploymentId?: string,
    options?: ErrorOptions & { code?: string },
  ) {
    super(message, options);
    this.name = "ControlPlaneError";
    this.status = status;
    this.deploymentId = deploymentId;
    this.code = options?.code;
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

export type CreateControlPlaneProjectInput = {
  slug: string;
  name: string;
  description?: string | null;
};

export async function createControlPlaneProject(
  config: ControlPlaneConfig,
  input: CreateControlPlaneProjectInput,
  options: ListOptions = {},
): Promise<Project> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const body: Record<string, string> = {
    slug: input.slug,
    name: input.name,
  };
  const description = input.description?.trim();
  if (description) {
    body.description = description;
  }
  const response = await fetchImpl(`${config.baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 409) {
    throw new ControlPlaneError("control plane project conflict (409)", 409);
  }
  if (response.status === 422) {
    throw new ControlPlaneError("control plane project rejected (422)", 422);
  }
  if (!response.ok) {
    throw new ControlPlaneError(
      `control plane project request failed (${response.status})`,
      response.status,
    );
  }
  return parseProject(await response.json());
}

export async function getControlPlaneProject(
  config: ControlPlaneConfig,
  projectId: string,
  options: ListOptions = {},
): Promise<Project> {
  if (!isControlPlaneUuid(projectId)) {
    throw new ControlPlaneError("control plane project id was not a uuid");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}`,
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
    throw new ControlPlaneError("control plane project was not found (404)", 404);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane project request failed (${response.status})`,
      response.status,
    );
  }
  return parseProject(await response.json());
}

export type CreateControlPlaneEnvironmentInput = {
  projectId: string;
  slug: string;
  name: string;
  kind: string;
  region: string;
};

export async function createControlPlaneEnvironment(
  config: ControlPlaneConfig,
  input: CreateControlPlaneEnvironmentInput,
  options: ListOptions = {},
): Promise<EnvironmentOption> {
  if (!isControlPlaneUuid(input.projectId)) {
    throw new ControlPlaneError("control plane project id was not a uuid");
  }
  const project = await getControlPlaneProject(config, input.projectId, options);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(input.projectId)}/environments`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        slug: input.slug,
        name: input.name,
        kind: input.kind,
        region: input.region,
      }),
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane environment project was not found (404)", 404);
  }
  if (response.status === 409) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane environment conflict (409)", 409);
  }
  if (response.status === 422) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane environment rejected (422)", 422);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane environment request failed (${response.status})`,
      response.status,
    );
  }
  return parseEnvironmentOption(await response.json(), project);
}

export type UpdateControlPlaneProjectInput = {
  projectId: string;
  name?: string;
  description?: string | null;
};

export async function updateControlPlaneProject(
  config: ControlPlaneConfig,
  input: UpdateControlPlaneProjectInput,
  options: ListOptions = {},
): Promise<Project> {
  if (!isControlPlaneUuid(input.projectId)) {
    throw new ControlPlaneError("control plane project id was not a uuid");
  }
  const body: Record<string, string | null> = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.description !== undefined) {
    body.description = input.description;
  }
  return controlPlaneRequest(
    config,
    {
      method: "PATCH",
      path: `/api/v1/projects/${encodeURIComponent(input.projectId)}`,
      body,
      resource: "project",
      mapStatuses: { rejected: true },
      parse: parseProject,
    },
    options,
  );
}

export async function deleteControlPlaneProject(
  config: ControlPlaneConfig,
  projectId: string,
  options: ListOptions = {},
): Promise<void> {
  if (!isControlPlaneUuid(projectId)) {
    throw new ControlPlaneError("control plane project id was not a uuid");
  }
  await controlPlaneRequest(
    config,
    {
      method: "DELETE",
      path: `/api/v1/projects/${encodeURIComponent(projectId)}`,
      resource: "project",
      empty: true,
    },
    options,
  );
}

export type UpdateControlPlaneEnvironmentInput = {
  projectId: string;
  environmentId: string;
  name?: string;
  kind?: string;
  region?: string;
};

export async function updateControlPlaneEnvironment(
  config: ControlPlaneConfig,
  input: UpdateControlPlaneEnvironmentInput,
  options: ListOptions = {},
): Promise<EnvironmentOption> {
  if (!isControlPlaneUuid(input.projectId) || !isControlPlaneUuid(input.environmentId)) {
    throw new ControlPlaneError("control plane environment ids were not uuids");
  }
  const project = await getControlPlaneProject(config, input.projectId, options);
  const body: Record<string, string> = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.kind !== undefined) {
    body.kind = input.kind;
  }
  if (input.region !== undefined) {
    body.region = input.region;
  }
  return controlPlaneRequest(
    config,
    {
      method: "PATCH",
      path: `/api/v1/projects/${encodeURIComponent(input.projectId)}/environments/${encodeURIComponent(input.environmentId)}`,
      body,
      resource: "environment",
      mapStatuses: { rejected: true },
      parse: (json) => parseEnvironmentOption(json, project),
    },
    options,
  );
}

export async function deleteControlPlaneEnvironment(
  config: ControlPlaneConfig,
  projectId: string,
  environmentId: string,
  options: ListOptions = {},
): Promise<void> {
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(environmentId)) {
    throw new ControlPlaneError("control plane environment ids were not uuids");
  }
  await controlPlaneRequest(
    config,
    {
      method: "DELETE",
      path: `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}`,
      resource: "environment",
      empty: true,
    },
    options,
  );
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

export type ControlPlaneProjectDetail = {
  project: Project;
  environments: EnvironmentOption[];
  routes: ProjectRoute[];
  /** True when routes failed to load; false when the list succeeded (possibly empty). */
  routesUnavailable: boolean;
};

const ROUTE_HOSTNAME_MAX = 253;
/** Matches control-plane `Hostname` (lowercase DNS labels). */
const ROUTE_HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export async function getControlPlaneProjectDetail(
  config: ControlPlaneConfig,
  projectId: string,
  options: ListOptions = {},
): Promise<ControlPlaneProjectDetail> {
  const project = await getControlPlaneProject(config, projectId, options);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  // Environments stay required; routes are best-effort so a routes outage does not hide the project.
  const [environments, routesResult] = await Promise.all([
    listProjectEnvironments(config, project, accessToken, fetchImpl),
    loadProjectRoutesBestEffort(config, project.id, accessToken, fetchImpl),
  ]);
  return {
    project,
    environments,
    routes: routesResult.routes,
    routesUnavailable: routesResult.routesUnavailable,
  };
}

async function loadProjectRoutesBestEffort(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ routes: ProjectRoute[]; routesUnavailable: boolean }> {
  try {
    const routes = await listProjectRoutes(config, projectId, accessToken, fetchImpl);
    return { routes, routesUnavailable: false };
  } catch (cause: unknown) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error(
      "event=control_plane_project_routes_failed project_id=%s detail=%s",
      projectId,
      detail,
    );
    return { routes: [], routesUnavailable: true };
  }
}

export type CreateControlPlaneRouteInput = {
  projectId: string;
  environmentId: string;
  hostname: string;
  backendHost: string;
  backendPort: number;
  pathPrefix: string;
};

export async function createControlPlaneRoute(
  config: ControlPlaneConfig,
  input: CreateControlPlaneRouteInput,
  options: ListOptions = {},
): Promise<ProjectRoute> {
  if (!isControlPlaneUuid(input.projectId) || !isControlPlaneUuid(input.environmentId)) {
    throw new ControlPlaneError("control plane route ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(input.projectId)}/routes`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        environment_id: input.environmentId,
        hostname: input.hostname,
        path_prefix: input.pathPrefix,
        backend_host: input.backendHost,
        backend_port: input.backendPort,
      }),
      cache: "no-store",
    },
  );
  await throwIfRouteOrDnsResponseFailed(response, "route");
  return parseProjectRoute(await response.json(), input.projectId);
}

export async function getControlPlaneRouteDns(
  config: ControlPlaneConfig,
  projectId: string,
  routeId: string,
  options: ListOptions = {},
): Promise<RouteDnsRecord> {
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(routeId)) {
    throw new ControlPlaneError("control plane route dns ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/routes/${encodeURIComponent(routeId)}/dns`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  await throwIfRouteOrDnsResponseFailed(response, "route dns");
  return parseRouteDnsRecord(await response.json(), routeId);
}

export async function getControlPlaneRouteCertificate(
  config: ControlPlaneConfig,
  projectId: string,
  routeId: string,
  options: ListOptions = {},
): Promise<RouteCertificate> {
  return requestControlPlaneRouteCertificate(config, projectId, routeId, "GET", options);
}

export async function issueControlPlaneRouteCertificate(
  config: ControlPlaneConfig,
  projectId: string,
  routeId: string,
  options: ListOptions = {},
): Promise<RouteCertificate> {
  return requestControlPlaneRouteCertificate(config, projectId, routeId, "POST", options);
}

async function requestControlPlaneRouteCertificate(
  config: ControlPlaneConfig,
  projectId: string,
  routeId: string,
  method: "GET" | "POST",
  options: ListOptions = {},
): Promise<RouteCertificate> {
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(routeId)) {
    throw new ControlPlaneError("control plane route certificate ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const suffix = method === "POST" ? "/certificate/issue" : "/certificate";
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/routes/${encodeURIComponent(routeId)}${suffix}`,
    {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  await throwIfRouteOrDnsResponseFailed(response, "route certificate");
  return parseRouteCertificate(await response.json(), routeId);
}

async function throwIfRouteOrDnsResponseFailed(
  response: Response,
  operation: "route" | "route dns" | "route certificate",
): Promise<void> {
  if (response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${operation} target was not found (404)`, 404);
  }
  if (response.status === 409) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${operation} conflict (409)`, 409);
  }
  if (response.status === 422) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${operation} rejected (422)`, 422);
  }
  if (response.status === 503) {
    const code = await errorCode(response);
    const mappedCode =
      code === "acme_unavailable" || code === "dns01_unavailable"
        ? "certificate_unavailable"
        : "dns_record_unavailable";
    throw new ControlPlaneError(
      `control plane ${operation} unavailable (503)`,
      503,
      undefined,
      { code: mappedCode },
    );
  }
  if (response.status === 502) {
    const code = await errorCode(response);
    if (code === "issuer_failed") {
      throw new ControlPlaneError(
        `control plane ${operation} failed (502)`,
        502,
        undefined,
        { code: "certificate_issue_failed" },
      );
    }
    if (code === "dns_record_failed" || code === "dns01_failed") {
      const mappedCode =
        operation === "route certificate" ? "certificate_issue_failed" : "dns_record_failed";
      throw new ControlPlaneError(
        `control plane ${operation} dns failed (502)`,
        502,
        undefined,
        { code: mappedCode },
      );
    }
    throw new ControlPlaneError(`control plane ${operation} request failed (502)`, 502);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane ${operation} request failed (${response.status})`,
      response.status,
    );
  }
}

function parseRouteCertificate(value: unknown, expectedRouteId: string): RouteCertificate {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane route certificate response was invalid");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.route_id !== "string" ||
    !isControlPlaneUuid(row.route_id) ||
    row.route_id !== expectedRouteId ||
    typeof row.hostname !== "string" ||
    typeof row.status !== "string" ||
    !ROUTE_CERTIFICATE_STATUSES.has(row.status as RouteCertificateStatus) ||
    (row.not_after !== undefined && row.not_after !== null && typeof row.not_after !== "string")
  ) {
    throw new ControlPlaneError("control plane route certificate response was invalid");
  }
  const hostname = row.hostname.toLowerCase();
  if (
    hostname.length === 0 ||
    hostname.length > ROUTE_HOSTNAME_MAX ||
    !ROUTE_HOSTNAME_PATTERN.test(hostname)
  ) {
    throw new ControlPlaneError("control plane route certificate response was invalid");
  }
  return {
    route_id: row.route_id,
    hostname,
    status: row.status as RouteCertificateStatus,
    not_after: typeof row.not_after === "string" ? row.not_after : null,
  };
}

function parseRouteDnsRecord(value: unknown, expectedRouteId: string): RouteDnsRecord {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane route dns response was invalid");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.route_id !== "string" ||
    !isControlPlaneUuid(row.route_id) ||
    row.route_id !== expectedRouteId ||
    typeof row.hostname !== "string" ||
    typeof row.record_type !== "string" ||
    !DNS_RECORD_TYPES.has(row.record_type as DnsRecordType) ||
    typeof row.data !== "string" ||
    typeof row.ttl !== "number" ||
    !Number.isInteger(row.ttl) ||
    row.ttl <= 0 ||
    typeof row.status !== "string" ||
    !DNS_RECORD_STATUSES.has(row.status as DnsRecordStatus)
  ) {
    throw new ControlPlaneError("control plane route dns response was invalid");
  }
  const hostname = row.hostname.toLowerCase();
  const data = row.data.trim();
  if (
    hostname.length === 0 ||
    hostname.length > ROUTE_HOSTNAME_MAX ||
    !ROUTE_HOSTNAME_PATTERN.test(hostname) ||
    data.length === 0 ||
    data.length > ROUTE_HOSTNAME_MAX + 1
  ) {
    throw new ControlPlaneError("control plane route dns response was invalid");
  }
  return {
    route_id: row.route_id,
    hostname,
    record_type: row.record_type as DnsRecordType,
    data,
    ttl: row.ttl,
    status: row.status as DnsRecordStatus,
  };
}

type ControlPlaneResource = "project" | "environment";

type ControlPlaneRequestSpec<T> = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  resource: ControlPlaneResource;
  mapStatuses?: {
    notFound?: boolean;
    rejected?: boolean;
    conflict?: boolean;
  };
  parse?: (body: unknown) => T;
  /** Discard the body and resolve without parsing (DELETE / 204). */
  empty?: boolean;
};

/** Shared bearer fetch + 404/422/conflict/!ok mapping for project/environment mutates. */
async function controlPlaneRequest<T>(
  config: ControlPlaneConfig,
  spec: ControlPlaneRequestSpec<T>,
  options: ListOptions = {},
): Promise<T> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
  };
  let body: string | undefined;
  if (spec.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(spec.body);
  }
  const response = await fetchImpl(`${config.baseUrl}${spec.path}`, {
    method: spec.method,
    headers,
    body,
    cache: "no-store",
  });
  const map = {
    notFound: true,
    rejected: false,
    conflict: false,
    ...spec.mapStatuses,
  };
  if (map.notFound && response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${spec.resource} was not found (404)`, 404);
  }
  if (map.conflict && response.status === 409) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${spec.resource} conflict (409)`, 409);
  }
  if (map.rejected && response.status === 422) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${spec.resource} rejected (422)`, 422);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane ${spec.resource} request failed (${response.status})`,
      response.status,
    );
  }
  if (spec.empty || !spec.parse) {
    await discardResponseBody(response);
    return undefined as T;
  }
  return spec.parse(await response.json());
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
  await throwIfEnvironmentJobResponseFailed(response, "provision");
  await discardResponseBody(response);
}

export async function reconcileControlPlaneEnvironment(
  config: ControlPlaneConfig,
  projectId: string,
  environmentId: string,
  options: ListOptions = {},
): Promise<AcceptedJob> {
  if (!isControlPlaneUuid(projectId) || !isControlPlaneUuid(environmentId)) {
    throw new ControlPlaneError("control plane reconcile ids were not uuids");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/reconcile`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  await throwIfEnvironmentJobResponseFailed(response, "reconcile");
  return parseAcceptedJob(await response.json(), {
    kind: "reconcile",
    projectId,
    environmentId,
  });
}

async function throwIfEnvironmentJobResponseFailed(
  response: Response,
  operation: "provision" | "reconcile",
): Promise<void> {
  if (response.status === 404) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${operation} target was not found (404)`, 404);
  }
  if (response.status === 503) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane ${operation} queue unavailable (503)`, 503);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(
      `control plane ${operation} request failed (${response.status})`,
      response.status,
    );
  }
}

function parseAcceptedJob(
  value: unknown,
  expected: { kind: JobKind; projectId: string; environmentId: string },
): AcceptedJob {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane job accept response was not a job");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.job_id !== "string" ||
    !isControlPlaneUuid(row.job_id) ||
    typeof row.kind !== "string" ||
    !JOB_KINDS.has(row.kind as JobKind) ||
    row.kind !== expected.kind ||
    typeof row.project_id !== "string" ||
    !isControlPlaneUuid(row.project_id) ||
    row.project_id !== expected.projectId ||
    typeof row.environment_id !== "string" ||
    !isControlPlaneUuid(row.environment_id) ||
    row.environment_id !== expected.environmentId ||
    typeof row.status !== "string" ||
    !PROVISION_JOB_STATUSES.has(row.status as ProvisionJobStatus)
  ) {
    throw new ControlPlaneError("control plane job accept response was not a job");
  }
  return {
    job_id: row.job_id,
    kind: row.kind as JobKind,
    project_id: row.project_id,
    environment_id: row.environment_id,
    status: row.status as ProvisionJobStatus,
  };
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

export async function getControlPlaneJob(
  config: ControlPlaneConfig,
  jobId: string,
  options: ListOptions = {},
): Promise<ProvisionJob> {
  if (!isControlPlaneUuid(jobId)) {
    throw new ControlPlaneError("control plane job id was not a uuid");
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const accessToken = await accessTokenFor(config, fetchImpl, now);
  const response = await fetchImpl(
    `${config.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  if (response.status === 503) {
    await discardResponseBody(response);
    throw new ControlPlaneError("control plane job queue unavailable (503)", 503);
  }
  if (!response.ok) {
    await discardResponseBody(response);
    throw new ControlPlaneError(`control plane job request failed (${response.status})`, response.status);
  }
  return parseProvisionJob(await response.json(), jobId);
}

function parseProvisionJob(value: unknown, expectedJobId: string): ProvisionJob {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane job response was not a job");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.job_id !== "string" ||
    !isControlPlaneUuid(row.job_id) ||
    row.job_id !== expectedJobId ||
    typeof row.status !== "string" ||
    !PROVISION_JOB_STATUSES.has(row.status as ProvisionJobStatus)
  ) {
    throw new ControlPlaneError("control plane job response was not a job");
  }
  const job: ProvisionJob = {
    job_id: row.job_id,
    status: row.status as ProvisionJobStatus,
  };
  if (row.result === null) {
    job.result = null;
  } else if (row.result !== undefined) {
    job.result = parseProvisionJobResult(row.result);
  }
  if (row.error === null || typeof row.error === "string") {
    job.error = row.error;
  } else if (row.error !== undefined) {
    throw new ControlPlaneError("control plane job response was not a job");
  }
  return job;
}

function parseProvisionJobResult(value: unknown): Record<string, string | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ControlPlaneError("control plane job response was not a job");
  }
  const result: Record<string, string | boolean> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string" && typeof entry !== "boolean") {
      throw new ControlPlaneError("control plane job response was not a job");
    }
    result[key] = entry;
  }
  return result;
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
    (body) => parseItemsPage(body, "environments", (row) => parseEnvironmentOption(row, project)),
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

async function listProjectRoutes(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<ProjectRoute[]> {
  return listPaginatedProjectCollection(
    config,
    projectId,
    accessToken,
    fetchImpl,
    "routes",
    (body) => parseItemsPage(body, "routes", (row) => parseProjectRoute(row, projectId)),
  );
}

function parseItemsPage<T>(
  body: unknown,
  label: string,
  mapRow: (row: unknown) => T,
): { items: T[]; total: number } {
  if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
    throw new ControlPlaneError(`control plane ${label} response was not a page`);
  }
  const record = body as { items: unknown[]; total?: unknown };
  const pageItems = record.items.map(mapRow);
  return {
    items: pageItems,
    total: typeof record.total === "number" ? record.total : pageItems.length,
  };
}

function parseProjectRoute(value: unknown, projectId: string): ProjectRoute {
  if (!value || typeof value !== "object") {
    throw new ControlPlaneError("control plane route row was invalid");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !isControlPlaneUuid(row.id) ||
    typeof row.project_id !== "string" ||
    !isControlPlaneUuid(row.project_id) ||
    row.project_id !== projectId ||
    typeof row.environment_id !== "string" ||
    !isControlPlaneUuid(row.environment_id) ||
    typeof row.hostname !== "string" ||
    typeof row.enabled !== "boolean"
  ) {
    throw new ControlPlaneError("control plane route row was invalid");
  }
  const hostname = row.hostname.toLowerCase();
  if (
    hostname.length === 0 ||
    hostname.length > ROUTE_HOSTNAME_MAX ||
    !ROUTE_HOSTNAME_PATTERN.test(hostname)
  ) {
    throw new ControlPlaneError("control plane route row was invalid");
  }
  return {
    id: row.id,
    project_id: row.project_id,
    environment_id: row.environment_id,
    hostname,
    enabled: row.enabled,
  };
}

async function listPaginatedProjectCollection<T>(
  config: ControlPlaneConfig,
  projectId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  resource: "sandboxes" | "environments" | "routes",
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

function deploymentProvisionJobField(
  value: string | null | undefined,
): Pick<Deployment, "provision_job_id"> | Record<string, never> {
  if (value === undefined) {
    return {};
  }
  return { provision_job_id: value };
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
    ...deploymentProvisionJobField(optionalUuidField(row.provision_job_id)),
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
