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

type PollLoopOptions = {
  jobId: string;
  deploymentTerminal: boolean;
  initialStatus: ProvisionJobStatus | null;
  settleWithoutFetch: boolean;
  sink: ProvisionJobPollSink;
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

/** Mutable poll loop; keep helpers on the class so `startProvisionJobPoll` stays a short wire-up. */
class ProvisionJobPollLoop {
  private cancelled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private consecutiveErrors = 0;
  private lastStatus: ProvisionJobStatus | null;
  private everLeftQueued: boolean;

  constructor(private readonly options: PollLoopOptions) {
    this.lastStatus = options.initialStatus;
    this.everLeftQueued = this.lastStatus !== null && this.lastStatus !== "queued";
  }

  start(): void {
    if (this.options.settleWithoutFetch && this.lastStatus !== null) {
      this.scheduleNext();
      return;
    }
    void this.load();
  }

  dispose(): void {
    this.cancelled = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
  }

  private applyStop(reason: ProvisionJobPollStopReason): void {
    this.options.sink.onStopReason(reason);
    const message = messageForPollStop(reason, this.lastStatus);
    if (message !== null) {
      this.options.sink.onError(message);
    }
  }

  private scheduleNext(): void {
    if (this.cancelled) {
      return;
    }
    const decision = nextProvisionJobPoll({
      status: this.lastStatus,
      attempts: this.attempts,
      consecutiveErrors: this.consecutiveErrors,
      everLeftQueued: this.everLeftQueued,
      deploymentTerminal: this.options.deploymentTerminal,
    });
    if (!decision.keepPolling) {
      this.applyStop(decision.reason);
      return;
    }
    this.timer = setTimeout(() => {
      void this.load();
    }, PROVISION_JOB_POLL_MS);
  }

  private async load(): Promise<void> {
    const { jobId, sink } = this.options;
    try {
      const next = await fetchProvisionJob(jobId);
      if (this.cancelled) {
        return;
      }
      this.attempts += 1;
      this.consecutiveErrors = 0;
      this.lastStatus = next.status;
      sink.onRetainStatus(next.status);
      if (next.status !== "queued") {
        this.everLeftQueued = true;
      }
      sink.onJob(next);
      sink.onError(null);
      this.scheduleNext();
    } catch (cause: unknown) {
      if (this.cancelled) {
        return;
      }
      if (cause instanceof SessionEnded) {
        sink.onError(cause.message);
        sink.onStopReason("errors");
        return;
      }
      this.attempts += 1;
      this.consecutiveErrors += 1;
      sink.onError(cause instanceof Error ? cause.message : "Could not load job status.");
      this.scheduleNext();
    }
  }
}

/**
 * Non-React poll loop for provision job status. The hook only owns React state
 * and wires cancellation / deps into this controller.
 */
export function startProvisionJobPoll(options: PollLoopOptions): () => void {
  const loop = new ProvisionJobPollLoop(options);
  loop.start();
  return () => loop.dispose();
}
