import type { Deployment, EnvironmentOption } from "@/lib/types";

/** `project_slug/environment_slug` when the linked env is still in the catalog. */
export function deploymentEnvironmentLabel(
  deployment: Pick<Deployment, "project_id" | "environment_id">,
  environments: EnvironmentOption[],
): string | null {
  if (!deployment.project_id || !deployment.environment_id) {
    return null;
  }
  const match = environments.find(
    (row) =>
      row.project_id === deployment.project_id && row.id === deployment.environment_id,
  );
  if (!match) {
    return null;
  }
  return `${match.project_slug}/${match.slug}`;
}
