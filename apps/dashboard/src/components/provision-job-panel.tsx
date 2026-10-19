"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
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
import type { ProvisionJob, ProvisionJobStatus } from "@/lib/types";

/** Modest poll while the Celery job is still in flight (#140). */
export const PROVISION_JOB_POLL_MS = 5_000;

const ACTIVE_STATUSES = new Set<ProvisionJobStatus>(["queued", "running", "retrying"]);

function jobStatusBadge(status: ProvisionJobStatus) {
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
  if (status === "retrying") {
    return (
      <Badge variant="secondary">
        <Loader2 className="animate-spin" />
        Retrying
      </Badge>
    );
  }
  if (status === "queued") {
    return (
      <Badge variant="secondary">
        <Loader2 className="animate-spin" />
        Queued
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

type ProvisionJobPanelProps = {
  jobId: string;
};

export function ProvisionJobPanel({ jobId }: ProvisionJobPanelProps) {
  const [job, setJob] = useState<ProvisionJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const next = await fetchProvisionJob(jobId);
        if (cancelled) {
          return;
        }
        setJob(next);
        setError(null);
        if (ACTIVE_STATUSES.has(next.status)) {
          timer = setTimeout(() => {
            void load();
          }, PROVISION_JOB_POLL_MS);
        }
      } catch (cause: unknown) {
        if (cancelled) {
          return;
        }
        setError(cause instanceof Error ? cause.message : "Could not load job status.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [jobId]);

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
