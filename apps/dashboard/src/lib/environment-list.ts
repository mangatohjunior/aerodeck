import type { EnvironmentOption } from "@/lib/types";

/** Newest-first merge by id (keeps first occurrence). */
export function mergeEnvironmentsById(
  ...lists: EnvironmentOption[][]
): EnvironmentOption[] {
  const seen = new Set<string>();
  const merged: EnvironmentOption[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

export function environmentsForProject(
  environments: EnvironmentOption[],
  projectId: string,
): EnvironmentOption[] {
  return environments.filter((row) => row.project_id === projectId);
}
