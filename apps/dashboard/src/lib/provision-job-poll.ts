import type { DeploymentStatus, ProvisionJobStatus } from "@/lib/types";
import { PROVISION_JOB_ACTIVE_STATUSES } from "@/lib/types";

/** Modest poll while the Celery job is still in flight (#140). */
export const PROVISION_JOB_POLL_MS = 5_000;

/** Hard ceiling (~3 min at 5s) so unknown/expired jobs cannot poll forever. */
export const PROVISION_JOB_POLL_MAX_ATTEMPTS = 36;

/**
 * Control plane maps unknown/expired job ids to `queued` forever. Stop sooner when
 * status never leaves queued (still ~2 min of grace for a slow broker).
 */
export const PROVISION_JOB_POLL_MAX_QUEUED_ONLY = 24;

/** Stop after this many consecutive BFF/CP failures without a successful read. */
export const PROVISION_JOB_POLL_MAX_CONSECUTIVE_ERRORS = 5;

export type ProvisionJobPollStopReason = "terminal" | "stale" | "errors" | "deadline" | "deployment_terminal";

export type ProvisionJobPollDecision =
  | { keepPolling: true }
  | { keepPolling: false; reason: ProvisionJobPollStopReason };

export type ProvisionJobPollState = {
  status: ProvisionJobStatus | null;
  /** Successful + failed fetches counted toward the hard ceiling. */
  attempts: number;
  consecutiveErrors: number;
  /** True once we observed running/retrying (or any non-queued active/terminal). */
  everLeftQueued: boolean;
  /** When the parent deployment is already succeeded/failed, do not keep polling. */
  deploymentTerminal: boolean;
};

export function isTerminalDeploymentStatus(status: DeploymentStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function isActiveProvisionJobStatus(status: ProvisionJobStatus): boolean {
  return PROVISION_JOB_ACTIVE_STATUSES.has(status);
}

/** Active CP status after we stopped polling — badge should not keep spinning. */
export function isSettledActiveProvisionJob(
  reason: ProvisionJobPollStopReason | null,
  status: ProvisionJobStatus | null,
): boolean {
  if (reason === null || status === null || !isActiveProvisionJobStatus(status)) {
    return false;
  }
  return reason === "deployment_terminal" || reason === "stale" || reason === "deadline";
}

export function provisionJobPollStopMessage(reason: ProvisionJobPollStopReason): string {
  switch (reason) {
    case "stale":
      return "Job is still queued with no progress; polling stopped. The result may have expired — refresh to try again.";
    case "errors":
      return "Could not load job status after several tries; polling stopped. Refresh to try again.";
    case "deadline":
      return "Job is still in progress after the poll limit; polling stopped. Refresh to try again.";
    case "deployment_terminal":
      return "Deployment already finished; job result may have expired (unknown jobs look queued on the control plane).";
    case "terminal":
      return "";
  }
}

/**
 * Decide whether to schedule another poll. Pure so unit tests cover stop rules
 * without mounting the panel (unknown job → forever `queued` on the CP).
 */
export function nextProvisionJobPoll(state: ProvisionJobPollState): ProvisionJobPollDecision {
  if (state.deploymentTerminal) {
    return { keepPolling: false, reason: "deployment_terminal" };
  }
  if (state.status !== null && !isActiveProvisionJobStatus(state.status)) {
    return { keepPolling: false, reason: "terminal" };
  }
  if (state.consecutiveErrors >= PROVISION_JOB_POLL_MAX_CONSECUTIVE_ERRORS) {
    return { keepPolling: false, reason: "errors" };
  }
  if (
    state.status === "queued" &&
    !state.everLeftQueued &&
    state.attempts >= PROVISION_JOB_POLL_MAX_QUEUED_ONLY
  ) {
    return { keepPolling: false, reason: "stale" };
  }
  if (state.attempts >= PROVISION_JOB_POLL_MAX_ATTEMPTS) {
    return { keepPolling: false, reason: "deadline" };
  }
  // status is null (first schedule after error) or still active — keep going.
  return { keepPolling: true };
}
