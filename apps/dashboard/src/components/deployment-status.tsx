"use client";

import { CheckCircle2, Loader2, Rocket, XCircle } from "lucide-react";
import { useState } from "react";

import { DeploymentEnvironmentLink } from "@/components/deployment-environment-link";
import { LinkButton } from "@/components/link-button";
import { ProvisionJobPanel } from "@/components/provision-job-panel";
import { Terminal } from "@/components/terminal";
import { Badge } from "@/components/ui/badge";
import { formatInstant } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deploymentLogsUrl,
  markDeploymentFailed,
  markDeploymentSucceeded,
} from "@/lib/api";
import { useEnvironmentCatalog } from "@/lib/use-environment-catalog";
import type { Deployment, DeploymentStatus, ProjectSource } from "@/lib/types";

type DeploymentStatusViewProps = {
  deployment: Deployment;
  logSource: ProjectSource;
};

type TerminalOutcome = "succeeded" | "failed";

function logSourceCopy(source: ProjectSource): { sseLabel: string; targetLabel: string } {
  if (source === "control-plane") {
    return {
      sseLabel: "Control-plane SSE for ",
      targetLabel: "DigitalOcean · control plane",
    };
  }
  return {
    sseLabel: "Mock SSE for ",
    targetLabel: "DigitalOcean · mock provisioner",
  };
}

function statusBadge(status: DeploymentStatus) {
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <XCircle />
        Failed
      </Badge>
    );
  }
  if (status === "succeeded") {
    return (
      <Badge variant="default">
        <CheckCircle2 />
        Succeeded
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="animate-spin" />
      Running
    </Badge>
  );
}

export function DeploymentStatusView({ deployment, logSource }: DeploymentStatusViewProps) {
  const [status, setStatus] = useState<DeploymentStatus>(deployment.status);
  const [error, setError] = useState<string | null>(null);
  const environments = useEnvironmentCatalog(
    logSource === "control-plane" && Boolean(deployment.project_id && deployment.environment_id),
  );
  const copy = logSourceCopy(logSource);

  function recordOutcome(outcome: TerminalOutcome) {
    if (status === "succeeded" || status === "failed") {
      return;
    }
    if (logSource !== "control-plane") {
      setStatus(outcome);
      return;
    }
    const mark = outcome === "succeeded" ? markDeploymentSucceeded : markDeploymentFailed;
    void mark(deployment.id)
      .then((stored) => setStatus(stored.status))
      .catch((cause: unknown) => {
        // Stream already showed provision ended without Done; keep the badge honest
        // even if the status POST fails (worker may already have written failed).
        if (outcome === "failed") {
          setStatus("failed");
        }
        setError(cause instanceof Error ? cause.message : "Could not record the deployment status.");
      });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
            Live
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            Deployment Status
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {copy.sseLabel}
            <span className="font-mono text-foreground">
              {deployment.owner}/{deployment.repo}
            </span>
          </p>
        </div>
        <LinkButton href="/deploy" variant="outline">
          <Rocket data-icon="inline-start" />
          New deployment
        </LinkButton>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-mono text-sm">{deployment.id}</CardTitle>
              <CardDescription className="mt-1 break-all">
                {deployment.repo_url}
              </CardDescription>
            </div>
            {statusBadge(status)}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="mt-0.5 font-mono text-xs">
              {formatInstant(deployment.started_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="mt-0.5">{copy.targetLabel}</p>
          </div>
          {deployment.project_id && deployment.environment_id ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Environment</p>
              <DeploymentEnvironmentLink
                deployment={deployment}
                environments={environments}
                className="mt-0.5 text-sm text-muted-foreground"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {logSource === "control-plane" && deployment.provision_job_id ? (
        <ProvisionJobPanel
          jobId={deployment.provision_job_id}
          deploymentStatus={deployment.status}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Terminal
        streamUrl={deploymentLogsUrl(deployment.id, logSource)}
        onComplete={() => recordOutcome("succeeded")}
        onFailed={() => recordOutcome("failed")}
      />
    </div>
  );
}
