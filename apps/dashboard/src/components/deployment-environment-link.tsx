import Link from "next/link";

import { deploymentEnvironmentLabel } from "@/lib/deployment-environment-label";
import { projectDetailPath } from "@/lib/project-detail-path";
import type { Deployment, EnvironmentOption } from "@/lib/types";

type DeploymentEnvironmentLinkProps = {
  deployment: Pick<Deployment, "project_id" | "environment_id">;
  environments: EnvironmentOption[];
  className?: string;
};

/** Links to the project detail environments section when a deployment is linked. */
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
      <Link
        href={projectDetailPath(deployment.project_id, "environments")}
        className="text-primary hover:underline"
      >
        {label ?? "Linked environment"}
      </Link>
    </p>
  );
}
