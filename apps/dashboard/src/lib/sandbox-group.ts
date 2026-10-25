import { SEED_PROJECTS } from "@/lib/catalog";
import type { Project, Sandbox } from "@/lib/types";

export type SandboxProjectGroup = {
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  sandboxes: Sandbox[];
};

function buildProjectMap(projects: readonly Project[]): Map<string, Project> {
  const byId = new Map<string, Project>();
  for (const seed of SEED_PROJECTS) {
    byId.set(seed.id, seed);
  }
  for (const project of projects) {
    byId.set(project.id, project);
  }
  return byId;
}

/**
 * Group sandboxes by `project_id` in order of first appearance, resolving
 * project name and slug from `projects` (with a fallback to `SEED_PROJECTS` or
 * the raw `project_id` when unknown).
 */
export function groupSandboxesByProject(
  sandboxes: readonly Sandbox[],
  projects: readonly Project[],
): SandboxProjectGroup[] {
  const projectsById = buildProjectMap(projects);
  const groupsById = new Map<string, SandboxProjectGroup>();

  for (const sandbox of sandboxes) {
    const existing = groupsById.get(sandbox.project_id);
    if (existing) {
      existing.sandboxes.push(sandbox);
      continue;
    }
    const project = projectsById.get(sandbox.project_id);
    groupsById.set(sandbox.project_id, {
      projectId: sandbox.project_id,
      projectName: project ? project.name : sandbox.project_id,
      projectSlug: project ? project.slug : null,
      sandboxes: [sandbox],
    });
  }

  return Array.from(groupsById.values());
}

/** Format an ISO-8601 `expires_at` timestamp as `YYYY-MM-DD HH:MM:SS UTC`. */
export function formatSandboxExpiry(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return expiresAt;
  }
  const iso = new Date(timestamp).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** Return true when `expiresAt` is a valid timestamp at or before `nowMs`. */
export function isSandboxExpired(
  expiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isNaN(timestamp) && timestamp <= nowMs;
}
