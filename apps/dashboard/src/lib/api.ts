import { MOCK_API_PREFIX } from "@/lib/catalog";
import type { ApiError, Deployment, Project, Sandbox } from "@/lib/types";

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

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${MOCK_API_PREFIX}/projects`);
  return readJson(response);
}

export async function fetchSandboxes(): Promise<Sandbox[]> {
  const response = await fetch(`${MOCK_API_PREFIX}/sandboxes`);
  return readJson(response);
}

export async function fetchDeployments(): Promise<Deployment[]> {
  const response = await fetch(`${MOCK_API_PREFIX}/deployments`);
  return readJson(response);
}

export async function fetchDeployment(id: string): Promise<Deployment> {
  const response = await fetch(`${MOCK_API_PREFIX}/deployments/${id}`);
  return readJson(response);
}

export async function createDeployment(repoUrl: string): Promise<Deployment> {
  const response = await fetch(`${MOCK_API_PREFIX}/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  return readJson(response);
}

export function deploymentLogsUrl(id: string): string {
  return `${MOCK_API_PREFIX}/deployments/${id}/logs`;
}
