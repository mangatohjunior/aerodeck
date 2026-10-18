"use client";

import { useEffect, useState } from "react";

import { DeploymentStatusView } from "@/components/deployment-status";
import { fetchDeployment, fetchLogSource } from "@/lib/api";
import type { Deployment, ProjectSource } from "@/lib/types";

export function DeploymentDetail({
  id,
  controlPlane = false,
}: {
  id: string;
  controlPlane?: boolean;
}) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logSource, setLogSource] = useState<ProjectSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDeployment(id, controlPlane), fetchLogSource()])
      .then(([nextDeployment, source]) => {
        setDeployment(nextDeployment);
        setLogSource(source);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Deployment not found.");
      });
  }, [id, controlPlane]);

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!deployment || !logSource) {
    return <p className="text-sm text-muted-foreground">Loading deployment…</p>;
  }

  return <DeploymentStatusView deployment={deployment} logSource={logSource} />;
}
