import Link from "next/link";

import { deploymentEnvironmentLabel } from "@/lib/deployment-environment-label";
import type { Deployment, EnvironmentOption } from "@/lib/types";

type DeploymentEnvironmentLinkProps = {
  deployment: Pick<Deployment, "project_id" | "environment_id">;
  environments: EnvironmentOption[];
  className?: string;
};

/** Always links to Projects; shows slug when the catalog matches. */
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
      <Link href="/projects" className="text-primary hover:underline">
        {label ?? "Linked environment"}
      </Link>
    </p>
  );
}
