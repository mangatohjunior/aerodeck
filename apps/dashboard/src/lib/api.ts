import { MOCK_API_PREFIX } from "@/lib/catalog";
import {
  PROVISION_ENQUEUE_FAILED,
  type ApiError,
  type Deployment,
  type EnvironmentOption,
  type EnvironmentOptionPage,
  type Project,
  type ProjectDetail,
  type ProjectPage,
  type ProjectSource,
  type PublicUser,
  type SandboxPage,
} from "@/lib/types";

export class SessionEnded extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "SessionEnded";
  }
}

/** Deployment row exists but provision was not queued — do not open the terminal yet. */
export class ProvisionEnqueueFailed extends Error {
  readonly deploymentId: string;

  constructor(detail: string, deploymentId: string) {
    super(detail);
    this.name = "ProvisionEnqueueFailed";
    this.deploymentId = deploymentId;
  }
}

/** Map a failed Deploy create response; used by createDeployment and tests. */
export function errorFromFailedCreate(body: ApiError, status: number): Error {
  if (
    body.code === PROVISION_ENQUEUE_FAILED &&
    typeof body.deployment_id === "string" &&
    body.deployment_id.length > 0
  ) {
    return new ProvisionEnqueueFailed(
      body.detail ?? `Request failed (${status})`,
      body.deployment_id,
    );
  }
  return new Error(body.detail ?? `Request failed (${status})`);
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.detail ?? `Request failed (${response.status})`);
  }
  return body as T;
}

async function readCreateDeploymentResponse(response: Response): Promise<Deployment> {
  const body = (await response.json()) as Deployment | ApiError;
  if (!response.ok) {
    throw errorFromFailedCreate(body as ApiError, response.status);
  }
  return body as Deployment;
}

export async function fetchHealth(): Promise<{ status: string; mode: string }> {
  const response = await fetch(`${MOCK_API_PREFIX}/healthz`);
  return readJson(response);
}

export async function fetchProjectPage(): Promise<ProjectPage> {
  const response = await fetch("/api/console/projects", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
}

export async function fetchProjectDetail(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(`/api/console/projects/${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
}

export async function createProject(input: {
  slug: string;
  name: string;
  description?: string | null;
}): Promise<Project> {
  const body: Record<string, string> = {
    slug: input.slug,
    name: input.name,
  };
  if (input.description) {
    body.description = input.description;
  }
  const response = await fetch("/api/console/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export async function fetchSandboxPage(): Promise<SandboxPage> {
  const response = await fetch("/api/console/sandboxes", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
}

export async function fetchDeployments(controlPlane = false): Promise<Deployment[]> {
  const path = controlPlane ? "/api/console/deployments" : `${MOCK_API_PREFIX}/deployments`;
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  return readJson(response);
}

export async function fetchDeployment(id: string, controlPlane = false): Promise<Deployment> {
  const deploymentId = encodeURIComponent(id);
  const path = controlPlane
    ? `/api/console/deployments/${deploymentId}`
    : `${MOCK_API_PREFIX}/deployments/${deploymentId}`;
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  return readJson(response);
}

export async function fetchEnvironments(): Promise<EnvironmentOptionPage> {
  const response = await fetch("/api/console/environments", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
}

export async function createEnvironment(input: {
  projectId: string;
  slug: string;
  name: string;
  kind: string;
  region?: string;
}): Promise<EnvironmentOption> {
  const body: Record<string, string> = {
    project_id: input.projectId,
    slug: input.slug,
    name: input.name,
    kind: input.kind,
  };
  if (input.region) {
    body.region = input.region;
  }
  const response = await fetch("/api/console/environments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export async function createDeployment(
  repoUrl: string,
  controlPlane: true,
  target: { projectId: string; environmentId: string },
): Promise<Deployment>;
export async function createDeployment(
  repoUrl: string,
  controlPlane?: false,
  target?: undefined,
): Promise<Deployment>;
export async function createDeployment(
  repoUrl: string,
  controlPlane = false,
  target?: { projectId: string; environmentId: string },
): Promise<Deployment> {
  if (controlPlane && (!target?.projectId || !target?.environmentId)) {
    throw new Error("Select an environment to provision.");
  }
  const path = controlPlane ? "/api/console/deployments" : `${MOCK_API_PREFIX}/deployments`;
  const body: Record<string, string> = { repo_url: repoUrl };
  if (controlPlane && target) {
    body.project_id = target.projectId;
    body.environment_id = target.environmentId;
  }
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return readCreateDeploymentResponse(response);
}

export async function fetchLogSource(): Promise<ProjectSource> {
  const response = await fetch("/api/console/log-source", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await readJson<{ source: ProjectSource }>(response);
  return body.source;
}

async function markDeploymentStatus(
  id: string,
  outcome: "succeeded" | "failed",
): Promise<Deployment> {
  const response = await fetch(
    `/api/console/deployments/${encodeURIComponent(id)}/${outcome}`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  return readJson(response);
}

export function markDeploymentSucceeded(id: string): Promise<Deployment> {
  return markDeploymentStatus(id, "succeeded");
}

export function markDeploymentFailed(id: string): Promise<Deployment> {
  return markDeploymentStatus(id, "failed");
}

/** Must match control-plane `PROVISION_QUEUE_FAILED_LINE`. */
export const PROVISION_QUEUE_FAILED_LINE = "Provision queue failed";

/** Must match control-plane `provision_failure_line` prefix. */
export const PROVISION_FAILED_LINE_PREFIX = "Provision failed:";

/** Log lines that mean provision ended without Done. */
export function isProvisionFailureLogLine(line: string): boolean {
  return line === PROVISION_QUEUE_FAILED_LINE || line.startsWith(PROVISION_FAILED_LINE_PREFIX);
}

export function deploymentLogsUrl(id: string, source: ProjectSource): string {
  const deploymentId = encodeURIComponent(id);
  if (source === "control-plane") {
    return `/api/console/deployments/${deploymentId}/logs`;
  }
  return `${MOCK_API_PREFIX}/deployments/${deploymentId}/logs`;
}

export async function registerAccount(
  email: string,
  password: string,
  controlPlane = false,
): Promise<PublicUser> {
  const path = controlPlane ? "/api/console/register" : `${MOCK_API_PREFIX}/auth/register`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return readJson(response);
}

export async function loginAccount(
  email: string,
  password: string,
): Promise<PublicUser> {
  const response = await fetch(`${MOCK_API_PREFIX}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  return readJson(response);
}

export async function fetchMe(): Promise<PublicUser> {
  const response = await fetch(`${MOCK_API_PREFIX}/auth/me`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) {
    throw new SessionEnded();
  }
  return readJson(response);
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch(`${MOCK_API_PREFIX}/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) {
    await readJson(response);
  }
}
