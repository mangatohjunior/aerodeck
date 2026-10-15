"use client";

import { use, useEffect, useState } from "react";

import { DeploymentStatusView } from "@/components/deployment-status";
import { fetchDeployment } from "@/lib/api";
import type { Deployment } from "@/lib/types";

export default function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDeployment(id)
      .then(setDeployment)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Deployment not found.");
      });
  }, [id]);

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!deployment) {
    return <p className="text-sm text-muted-foreground">Loading deployment…</p>;
  }

  return <DeploymentStatusView deployment={deployment} />;
}
