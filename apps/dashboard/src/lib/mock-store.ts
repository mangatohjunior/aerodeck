import { randomBytes } from "node:crypto";

import {
  INVALID_CREDENTIALS_DETAIL,
  isStrongPassword,
  isValidEmail,
  MockAuthError,
  normalizeEmail,
} from "@/lib/auth";
import { DEPLOY_LOG_EVENTS, SEED_PROJECTS, SEED_SANDBOXES } from "@/lib/catalog";
import { parseGithubRepo } from "@/lib/github";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { Deployment, Project, PublicUser, Sandbox } from "@/lib/types";

type MockUser = PublicUser & {
  password_hash: string | null;
  google_subject: string | null;
};

type MockSession = {
  token: string;
  user_id: string;
  created_at: string;
};

type Store = {
  projects: Project[];
  sandboxes: Sandbox[];
  deployments: Deployment[];
  users: MockUser[];
  sessions: MockSession[];
};

const DUMMY_PASSWORD_HASH = hashPassword("not-a-real-user");

const globalStore = globalThis as typeof globalThis & {
  __aerodeckMockStore?: Store;
};

function seed(): Store {
  return {
    projects: SEED_PROJECTS.map((row) => ({ ...row })),
    sandboxes: SEED_SANDBOXES.map((row) => ({ ...row })),
    deployments: [],
    users: [],
    sessions: [],
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
  if (!Array.isArray(store.sessions)) {
    store.sessions = [];
  }
  for (const user of store.users) {
    if (user.google_subject === undefined) {
      user.google_subject = null;
    }
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
    google_subject: null,
  };
  getStore().users.push(user);
  return toPublicUser(user);
}

export function loginUser(
  email: string,
  password: string,
): { user: PublicUser; token: string } {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new MockAuthError("missing_email", "email is required.");
  }
  if (password.length === 0) {
    throw new MockAuthError("missing_password", "password is required.");
  }

  const user = findUserByEmail(normalized);
  const hash = user?.password_hash ?? DUMMY_PASSWORD_HASH;
  if (
    !user ||
    !user.password_hash ||
    !isValidEmail(normalized) ||
    !verifyPassword(password, hash)
  ) {
    throw new MockAuthError("invalid_credentials", INVALID_CREDENTIALS_DETAIL);
  }

  return { user: toPublicUser(user), token: createSession(user.id) };
}

export function loginGoogleUser(
  email: string,
  subject: string,
): { user: PublicUser; token: string } {
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmail(normalized) || !subject.trim()) {
    throw new MockAuthError("invalid_email", "Google did not return a usable email.");
  }

  const existing = findUserByEmail(normalized);
  if (existing) {
    existing.google_subject = subject.trim();
    return { user: toPublicUser(existing), token: createSession(existing.id) };
  }

  const user: MockUser = {
    id: crypto.randomUUID(),
    email: normalized,
    created_at: new Date().toISOString(),
    password_hash: null,
    google_subject: subject.trim(),
  };
  getStore().users.push(user);
  return { user: toPublicUser(user), token: createSession(user.id) };
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  getStore().sessions.push({
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  return token;
}

export function destroySession(token: string): void {
  const store = getStore();
  store.sessions = store.sessions.filter((row) => row.token !== token);
}

export function getUserBySessionToken(token: string | undefined): PublicUser | undefined {
  if (!token) {
    return undefined;
  }
  const session = getStore().sessions.find((row) => row.token === token);
  if (!session) {
    return undefined;
  }
  const user = getStore().users.find((row) => row.id === session.user_id);
  return user ? toPublicUser(user) : undefined;
}
