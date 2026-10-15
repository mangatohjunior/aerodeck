import {
  isStrongPassword,
  isValidEmail,
  MockAuthError,
  normalizeEmail,
} from "@/lib/auth";
import { DEPLOY_LOG_EVENTS, SEED_PROJECTS, SEED_SANDBOXES } from "@/lib/catalog";
import { parseGithubRepo } from "@/lib/github";
import { hashPassword } from "@/lib/password";
import type { Deployment, Project, PublicUser, Sandbox } from "@/lib/types";

type MockUser = PublicUser & {
  password_hash: string;
};

type Store = {
  projects: Project[];
  sandboxes: Sandbox[];
  deployments: Deployment[];
  users: MockUser[];
};

const globalStore = globalThis as typeof globalThis & {
  __aerodeckMockStore?: Store;
};

function seed(): Store {
  return {
    projects: SEED_PROJECTS.map((row) => ({ ...row })),
    sandboxes: SEED_SANDBOXES.map((row) => ({ ...row })),
    deployments: [],
    users: [],
  };
}

export function getStore(): Store {
  if (!globalStore.__aerodeckMockStore) {
    globalStore.__aerodeckMockStore = seed();
  }
  const store = globalStore.__aerodeckMockStore;
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  return store;
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

function toPublicUser(user: MockUser): PublicUser {
  return { id: user.id, email: user.email, created_at: user.created_at };
}

export function findUserByEmail(email: string): MockUser | undefined {
  const normalized = normalizeEmail(email);
  return getStore().users.find((row) => row.email === normalized);
}

export function registerUser(email: string, password: string): PublicUser {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new MockAuthError("missing_email", "email is required.");
  }
  if (!isValidEmail(normalized)) {
    throw new MockAuthError("invalid_email", "Enter a valid email address.");
  }
  if (password.length === 0) {
    throw new MockAuthError("missing_password", "password is required.");
  }
  if (!isStrongPassword(password)) {
    throw new MockAuthError("weak_password", "Use at least 8 characters.");
  }
  if (findUserByEmail(normalized)) {
    throw new MockAuthError("email_taken", "That email is already registered.");
  }

  const user: MockUser = {
    id: crypto.randomUUID(),
    email: normalized,
    created_at: new Date().toISOString(),
    password_hash: hashPassword(password),
  };
  getStore().users.push(user);
  return toPublicUser(user);
}
