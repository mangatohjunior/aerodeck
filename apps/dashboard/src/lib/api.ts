import { MOCK_API_PREFIX } from "@/lib/catalog";
import type {
  ApiError,
  Deployment,
  ProjectPage,
  ProjectSource,
  PublicUser,
  SandboxPage,
} from "@/lib/types";

export class SessionEnded extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "SessionEnded";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.detail ?? `Request failed (${response.status})`);
  }
  return body as T;
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

export async function createDeployment(repoUrl: string, controlPlane = false): Promise<Deployment> {
  const path = controlPlane ? "/api/console/deployments" : `${MOCK_API_PREFIX}/deployments`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  return readJson(response);
}

export async function fetchLogSource(): Promise<ProjectSource> {
  const response = await fetch("/api/console/log-source", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await readJson<{ source: ProjectSource }>(response);
  return body.source;
}

export async function markDeploymentSucceeded(id: string): Promise<Deployment> {
  const response = await fetch(`/api/console/deployments/${encodeURIComponent(id)}/succeeded`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson(response);
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
