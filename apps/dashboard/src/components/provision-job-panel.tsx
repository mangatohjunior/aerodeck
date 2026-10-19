"use client";

import { CheckCircle2, Clock, Loader2, XCircle, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  isTerminalDeploymentStatus,
  settledActiveBadgeReason,
  settledActiveJobBadgeLabel,
  type ProvisionJobPollStopReason,
} from "@/lib/provision-job-poll";
import { useProvisionJobPoll } from "@/lib/use-provision-job-poll";
import type { DeploymentStatus, ProvisionJobStatus } from "@/lib/types";

const JOB_STATUS_BADGE: Record<
  ProvisionJobStatus,
  { variant: "default" | "secondary" | "destructive"; label: string; Icon: LucideIcon; spin?: boolean }
> = {
  queued: { variant: "secondary", label: "Queued", Icon: Loader2, spin: true },
  running: { variant: "secondary", label: "Running", Icon: Loader2, spin: true },
  retrying: { variant: "secondary", label: "Retrying", Icon: Loader2, spin: true },
  succeeded: { variant: "default", label: "Succeeded", Icon: CheckCircle2 },
  failed: { variant: "destructive", label: "Failed", Icon: XCircle },
};

function jobStatusBadge(status: ProvisionJobStatus, stopReason: ProvisionJobPollStopReason | null) {
  const settledReason = settledActiveBadgeReason(stopReason, status);
  if (settledReason !== null) {
    return (
      <Badge variant="secondary">
        <Clock />
        {settledActiveJobBadgeLabel(settledReason)}
      </Badge>
    );
  }
  const { variant, label, Icon, spin } = JOB_STATUS_BADGE[status];
  return (
    <Badge variant={variant}>
      <Icon className={spin ? "animate-spin" : undefined} />
      {label}
    </Badge>
  );
}

type ProvisionJobPanelProps = {
  jobId: string;
  /** Live deployment status — terminal outcomes stop further job polls. */
  deploymentStatus: DeploymentStatus;
};

export function ProvisionJobPanel({ jobId, deploymentStatus }: ProvisionJobPanelProps) {
  const deploymentTerminal = isTerminalDeploymentStatus(deploymentStatus);
  const { job, error, stopReason } = useProvisionJobPoll(jobId, deploymentTerminal);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Provision job</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs break-all">{jobId}</CardDescription>
          </div>
          {job ? jobStatusBadge(job.status, stopReason) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 pt-4 text-sm">
        {error ? (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!job && !error ? (
          <p className="text-muted-foreground">Loading job status…</p>
        ) : null}
        {job?.error ? (
          <p className="text-destructive" role="alert">
            {job.error}
          </p>
        ) : null}
        {job && !job.error && !error ? (
          <p className="text-muted-foreground">
            Structured status from the control plane (independent of the terminal stream).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
