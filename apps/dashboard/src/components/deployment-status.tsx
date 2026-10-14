"use client";

import { CheckCircle2, Loader2, Rocket } from "lucide-react";

import { Terminal } from "@/components/terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Deployment, DeploymentStatus } from "@/lib/mock-deploy";

type DeploymentStatusViewProps = {
  deployment: Deployment;
  status: DeploymentStatus;
  onStreamComplete: () => void;
  onNewDeployment: () => void;
};

export function DeploymentStatusView({
  deployment,
  status,
  onStreamComplete,
  onNewDeployment,
}: DeploymentStatusViewProps) {
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
            Mock SSE stream for{" "}
            <span className="font-mono text-foreground">
              {deployment.owner}/{deployment.repo}
            </span>
          </p>
        </div>
        <Button variant="outline" onClick={onNewDeployment}>
          <Rocket data-icon="inline-start" />
          New deployment
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-mono text-sm">
                {deployment.id}
              </CardTitle>
              <CardDescription className="mt-1 break-all">
                {deployment.repoUrl}
              </CardDescription>
            </div>
            <Badge variant={running ? "secondary" : "default"}>
              {running ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              {running ? "Running" : "Succeeded"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="mt-0.5 font-mono text-xs">
              {new Date(deployment.startedAt).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="mt-0.5">DigitalOcean · mock provisioner</p>
          </div>
        </CardContent>
      </Card>

      <Terminal active onComplete={onStreamComplete} />
    </div>
  );
}
