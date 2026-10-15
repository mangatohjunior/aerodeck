"use client";

import { CheckCircle2, Loader2, Rocket } from "lucide-react";
import { useState } from "react";

import { LinkButton } from "@/components/link-button";
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
import { deploymentLogsUrl } from "@/lib/api";
import type { Deployment, DeploymentStatus } from "@/lib/types";

type DeploymentStatusViewProps = {
  deployment: Deployment;
};

export function DeploymentStatusView({ deployment }: DeploymentStatusViewProps) {
  const [status, setStatus] = useState<DeploymentStatus>(deployment.status);
  const running = status === "running" || status === "queued";

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
            Mock SSE for{" "}
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
            <Badge variant={running ? "secondary" : "default"}>
              {running ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {running ? "Running" : "Succeeded"}
            </Badge>
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
            <p className="mt-0.5">DigitalOcean · mock provisioner</p>
          </div>
        </CardContent>
      </Card>

      <Terminal
        streamUrl={deploymentLogsUrl(deployment.id)}
        onComplete={() => setStatus("succeeded")}
      />
    </div>
  );
}
