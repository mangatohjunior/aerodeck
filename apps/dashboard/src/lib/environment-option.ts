import type { EnvironmentOption } from "./types";

/** Stable select value / lookup key for a project+environment pair. */
export function environmentOptionKey(
  row: Pick<EnvironmentOption, "project_id" | "id">,
): string {
  return `${row.project_id}:${row.id}`;
}
