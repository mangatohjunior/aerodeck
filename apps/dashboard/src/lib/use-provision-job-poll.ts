"use client";

import { useEffect, useState } from "react";

import { fetchProvisionJob } from "@/lib/api";
import {
  isActiveProvisionJobStatus,
  isSettledActiveProvisionJob,
  nextProvisionJobPoll,
  PROVISION_JOB_POLL_MS,
  provisionJobPollStopMessage,
  type ProvisionJobPollStopReason,
} from "@/lib/provision-job-poll";
import type { ProvisionJob, ProvisionJobStatus } from "@/lib/types";

export type ProvisionJobPollView = {
  job: ProvisionJob | null;
  error: string | null;
  /** True when polling stopped on an active status (stale / expired / ceiling). */
  settledActive: boolean;
};

/** Polls same-origin job status until terminal or a stop rule fires. */
export function useProvisionJobPoll(
  jobId: string,
  deploymentTerminal: boolean,
): ProvisionJobPollView {
  const [job, setJob] = useState<ProvisionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<ProvisionJobPollStopReason | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStatus: ProvisionJobStatus | null = null;
    let attempts = 0;
    let consecutiveErrors = 0;
    let everLeftQueued = false;

    setStopReason(null);

    function applyStop(reason: ProvisionJobPollStopReason) {
      setStopReason(reason);
      if (reason === "stale" || reason === "deadline") {
        setError(provisionJobPollStopMessage(reason));
        return;
      }
      if (reason === "deployment_terminal" && lastStatus !== null && isActiveProvisionJobStatus(lastStatus)) {
        setError(provisionJobPollStopMessage(reason));
      }
      // terminal / errors: stay quiet or keep the last BFF error.
    }

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
        applyStop(decision.reason);
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

  return {
    job,
    error,
    settledActive: isSettledActiveProvisionJob(stopReason, job?.status ?? null),
  };
}
