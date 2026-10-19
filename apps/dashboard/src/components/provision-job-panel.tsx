"use client";

import { CheckCircle2, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProvisionJob } from "@/lib/api";
import {
  isTerminalDeploymentStatus,
  nextProvisionJobPoll,
  PROVISION_JOB_POLL_MS,
  provisionJobPollStopMessage,
} from "@/lib/provision-job-poll";
import type { DeploymentStatus, ProvisionJob, ProvisionJobStatus } from "@/lib/types";

export { PROVISION_JOB_POLL_MS };

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

function jobStatusBadge(status: ProvisionJobStatus) {
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
  /** When the parent deployment is already terminal, fetch once and do not poll. */
  deploymentStatus: DeploymentStatus;
};

export function ProvisionJobPanel({ jobId, deploymentStatus }: ProvisionJobPanelProps) {
  const [job, setJob] = useState<ProvisionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deploymentTerminal = isTerminalDeploymentStatus(deploymentStatus);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStatus: ProvisionJobStatus | null = null;
    let attempts = 0;
    let consecutiveErrors = 0;
    let everLeftQueued = false;

    function scheduleNext() {
      if (cancelled) {
        return;
      }
      const decision = nextProvisionJobPoll({
        status: lastStatus,
        attempts,
        consecutiveErrors,
        everLeftQueued,
        deploymentTerminal,
      });
      if (!decision.keepPolling) {
        // Terminal job / finished deployment: stop quietly. Stale/deadline/errors need a message.
        if (decision.reason === "stale" || decision.reason === "deadline" || decision.reason === "errors") {
          setError(provisionJobPollStopMessage(decision.reason));
        }
        return;
      }
      timer = setTimeout(() => {
        void load();
      }, PROVISION_JOB_POLL_MS);
    }

    async function load() {
      try {
        const next = await fetchProvisionJob(jobId);
        if (cancelled) {
          return;
        }
        attempts += 1;
        consecutiveErrors = 0;
        lastStatus = next.status;
        if (next.status !== "queued") {
          everLeftQueued = true;
        }
        setJob(next);
        setError(null);
        scheduleNext();
      } catch (cause: unknown) {
        if (cancelled) {
          return;
        }
        attempts += 1;
        consecutiveErrors += 1;
        setError(cause instanceof Error ? cause.message : "Could not load job status.");
        scheduleNext();
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [jobId, deploymentTerminal]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Provision job</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs break-all">{jobId}</CardDescription>
          </div>
          {job ? jobStatusBadge(job.status) : null}
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
