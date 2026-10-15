import { DEPLOY_LOG_EVENTS, SEED_PROJECTS, SEED_SANDBOXES } from "@/lib/catalog";
import { parseGithubRepo } from "@/lib/github";
import type { Deployment, Project, Sandbox } from "@/lib/types";

type Store = {
  projects: Project[];
  sandboxes: Sandbox[];
  deployments: Deployment[];
};

const globalStore = globalThis as typeof globalThis & {
  __aerodeckMockStore?: Store;
};

function seed(): Store {
  return {
    projects: SEED_PROJECTS.map((row) => ({ ...row })),
    sandboxes: SEED_SANDBOXES.map((row) => ({ ...row })),
    deployments: [],
  };
}

export function getStore(): Store {
  if (!globalStore.__aerodeckMockStore) {
    globalStore.__aerodeckMockStore = seed();
  }
  return globalStore.__aerodeckMockStore;
}

export function listProjects(): Project[] {
  return getStore().projects;
}

export function listSandboxes(): Sandbox[] {
  return getStore().sandboxes;
}

export function listDeployments(): Deployment[] {
  return [...getStore().deployments].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );
}

export function getDeployment(id: string): Deployment | undefined {
  return getStore().deployments.find((row) => row.id === id);
}

export function createDeployment(repoUrl: string): Deployment {
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    throw new Error("invalid_github_url");
  }

  const deployment: Deployment = {
    id: crypto.randomUUID(),
    repo_url: repoUrl.trim(),
    owner: parsed.owner,
    repo: parsed.repo,
    started_at: new Date().toISOString(),
    status: "running",
  };
  getStore().deployments.unshift(deployment);
  return deployment;
}

export function markDeploymentSucceeded(id: string): void {
  const row = getDeployment(id);
  if (row) {
    row.status = "succeeded";
  }
}

export function logEvents() {
  return DEPLOY_LOG_EVENTS;
}
