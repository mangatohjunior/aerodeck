"use client";

import { useEffect, useRef, useState } from "react";

import { fetchProvisionJob, SessionEnded } from "@/lib/api";
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
  stopReason: ProvisionJobPollStopReason | null;
  /** True when polling stopped on an active status (stale / expired / ceiling / errors). */
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
  const prevJobIdRef = useRef(jobId);
  const retainedStatusRef = useRef<ProvisionJobStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let consecutiveErrors = 0;
    const jobIdChanged = prevJobIdRef.current !== jobId;
    prevJobIdRef.current = jobId;

    if (jobIdChanged) {
      setJob(null);
      setError(null);
      setStopReason(null);
      retainedStatusRef.current = null;
    } else if (deploymentTerminal) {
      // Keep the last badge while we stop / one-shot refresh — no loading flicker.
      setStopReason("deployment_terminal");
    }

    let lastStatus: ProvisionJobStatus | null = retainedStatusRef.current;
    let everLeftQueued = lastStatus !== null && lastStatus !== "queued";

    function applyStop(reason: ProvisionJobPollStopReason) {
      setStopReason(reason);
      if (reason === "stale" || reason === "deadline") {
        setError(provisionJobPollStopMessage(reason));
        return;
      }
      if (reason === "deployment_terminal" && lastStatus !== null && isActiveProvisionJobStatus(lastStatus)) {
        setError(provisionJobPollStopMessage(reason));
      }
      // terminal: quiet. errors: keep the last BFF message (settledActive stops the spinner).
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
        retainedStatusRef.current = next.status;
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
        if (cause instanceof SessionEnded) {
          setError(cause.message);
          setStopReason("errors");
          return;
        }
        attempts += 1;
        consecutiveErrors += 1;
        setError(cause instanceof Error ? cause.message : "Could not load job status.");
        scheduleNext();
      }
    }

    if (!jobIdChanged && deploymentTerminal && lastStatus !== null) {
      // Already have a status from the live poll — settle without a loading gap.
      scheduleNext();
    } else {
      void load();
    }

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
    stopReason,
    settledActive: isSettledActiveProvisionJob(stopReason, job?.status ?? null),
  };
}
