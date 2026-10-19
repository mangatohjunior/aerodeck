import { fetchProvisionJob, SessionEnded } from "@/lib/api";
import {
  isActiveProvisionJobStatus,
  nextProvisionJobPoll,
  PROVISION_JOB_POLL_MS,
  provisionJobPollStopMessage,
  type ProvisionJobPollStopReason,
} from "@/lib/provision-job-poll";
import type { ProvisionJob, ProvisionJobStatus } from "@/lib/types";

export type ProvisionJobPollSink = {
  onJob: (job: ProvisionJob) => void;
  onError: (message: string | null) => void;
  onStopReason: (reason: ProvisionJobPollStopReason) => void;
  onRetainStatus: (status: ProvisionJobStatus) => void;
};

/** Message to show when a stop rule fires; null means leave the current error alone. */
export function messageForPollStop(
  reason: ProvisionJobPollStopReason,
  lastStatus: ProvisionJobStatus | null,
): string | null {
  if (reason === "stale" || reason === "deadline") {
    return provisionJobPollStopMessage(reason);
  }
  if (reason === "deployment_terminal" && lastStatus !== null && isActiveProvisionJobStatus(lastStatus)) {
    return provisionJobPollStopMessage(reason);
  }
  return null;
}

/**
 * Non-React poll loop for provision job status. The hook only owns React state
 * and wires cancellation / deps into this controller.
 */
export function startProvisionJobPoll(options: {
  jobId: string;
  deploymentTerminal: boolean;
  initialStatus: ProvisionJobStatus | null;
  /** When true, apply stop rules immediately without a loading fetch (terminal flip). */
  settleWithoutFetch: boolean;
  sink: ProvisionJobPollSink;
}): () => void {
  const { jobId, deploymentTerminal, sink } = options;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let consecutiveErrors = 0;
  let lastStatus: ProvisionJobStatus | null = options.initialStatus;
  let everLeftQueued = lastStatus !== null && lastStatus !== "queued";

  function applyStop(reason: ProvisionJobPollStopReason) {
    sink.onStopReason(reason);
    const message = messageForPollStop(reason, lastStatus);
    if (message !== null) {
      sink.onError(message);
    }
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
      sink.onRetainStatus(next.status);
      if (next.status !== "queued") {
        everLeftQueued = true;
      }
      sink.onJob(next);
      sink.onError(null);
      scheduleNext();
    } catch (cause: unknown) {
      if (cancelled) {
        return;
      }
      if (cause instanceof SessionEnded) {
        sink.onError(cause.message);
        sink.onStopReason("errors");
        return;
      }
      attempts += 1;
      consecutiveErrors += 1;
      sink.onError(cause instanceof Error ? cause.message : "Could not load job status.");
      scheduleNext();
    }
  }

  if (options.settleWithoutFetch && lastStatus !== null) {
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
}
