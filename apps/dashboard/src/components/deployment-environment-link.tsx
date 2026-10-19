import Link from "next/link";

import { deploymentEnvironmentLabel } from "@/lib/deployment-environment-label";
import type { Deployment, EnvironmentOption } from "@/lib/types";

type DeploymentEnvironmentLinkProps = {
  deployment: Pick<Deployment, "project_id" | "environment_id">;
  environments: EnvironmentOption[];
  className?: string;
};

/** Slug label when the catalog matches; otherwise a projects link (no raw UUIDs). */
export function DeploymentEnvironmentLink({
  deployment,
  environments,
  className = "text-xs text-muted-foreground",
}: DeploymentEnvironmentLinkProps) {
  if (!deployment.project_id || !deployment.environment_id) {
    return null;
  }
  const label = deploymentEnvironmentLabel(deployment, environments);
  return (
    <p className={className}>
      {label ? (
        label
      ) : (
        <Link href="/projects" className="text-primary hover:underline">
          Linked environment
        </Link>
      )}
    </p>
  );
}
