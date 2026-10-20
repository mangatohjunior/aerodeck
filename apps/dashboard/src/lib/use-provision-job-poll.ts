"use client";

import { useEffect, useRef, useState } from "react";

import { startProvisionJobPoll } from "@/lib/provision-job-poll-controller";
import {
  isSettledActiveProvisionJob,
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
    const jobIdChanged = prevJobIdRef.current !== jobId;
    prevJobIdRef.current = jobId;

    if (jobIdChanged) {
      setJob(null);
      setError(null);
      setStopReason(null);
      retainedStatusRef.current = null;
    } else if (deploymentTerminal) {
      // Keep the last badge while we stop — no loading flicker.
      setStopReason("deployment_terminal");
    }

    return startProvisionJobPoll({
      jobId,
      deploymentTerminal,
      initialStatus: retainedStatusRef.current,
      settleWithoutFetch: !jobIdChanged && deploymentTerminal && retainedStatusRef.current !== null,
      sink: {
        onJob: setJob,
        onError: setError,
        onStopReason: setStopReason,
        onRetainStatus: (status) => {
          retainedStatusRef.current = status;
        },
      },
    });
  }, [jobId, deploymentTerminal]);

  return {
    job,
    error,
    stopReason,
    settledActive: isSettledActiveProvisionJob(stopReason, job?.status ?? null),
  };
}
