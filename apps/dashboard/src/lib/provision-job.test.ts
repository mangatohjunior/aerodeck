import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchProvisionJob, SessionEnded } from "./api";
import { clearControlPlaneTokenCache, ControlPlaneError, getControlPlaneJob } from "./control-plane";
import { messageForPollStop } from "./provision-job-poll-controller";
import {
  isSettledActiveProvisionJob,
  nextProvisionJobPoll,
  PROVISION_JOB_POLL_MAX_ATTEMPTS,
  PROVISION_JOB_POLL_MAX_CONSECUTIVE_ERRORS,
  PROVISION_JOB_POLL_MAX_QUEUED_ONLY,
  provisionJobPollStopMessage,
  settledActiveJobBadgeLabel,
} from "./provision-job-poll";

const config = {
  baseUrl: "https://cp.example",
  clientId: "console",
  clientSecret: "secret-value",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getControlPlaneJob", () => {
  it("reads job status with the bearer and hides secrets", async () => {
    clearControlPlaneTokenCache();
    const jobId = "44444444-4444-4444-8444-444444444444";
    let authorization = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      assert.ok(url.endsWith(`/api/v1/jobs/${jobId}`));
      return jsonResponse({
        job_id: jobId,
        status: "running",
        result: null,
        error: null,
        secret: "super-secret",
      });
    };
    const job = await getControlPlaneJob(config, jobId, { fetch: fetchImpl });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(job.status, "running");
    assert.equal(JSON.stringify(job).includes("super-secret"), false);
  });

  it("maps a down queue to 503 without leaking bodies", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "broker down", secret: "super-secret" }, 503);
    };
    await assert.rejects(
      () => getControlPlaneJob(config, "44444444-4444-4444-8444-444444444444", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.message.includes("super-secret"), false);
        return true;
      },
    );
  });

  it("rejects result maps with non-string/boolean values", async () => {
    clearControlPlaneTokenCache();
    const jobId = "44444444-4444-4444-8444-444444444444";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({
        job_id: jobId,
        status: "succeeded",
        result: { ok: true, nested: { nope: 1 } },
      });
    };
    await assert.rejects(
      () => getControlPlaneJob(config, jobId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a job/);
        return true;
      },
    );
  });

  it("rejects a non-uuid job_id in the response body", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({
        job_id: "not-a-uuid",
        status: "queued",
        result: null,
        error: null,
      });
    };
    await assert.rejects(
      () => getControlPlaneJob(config, "44444444-4444-4444-8444-444444444444", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a job/);
        return true;
      },
    );
  });

  it("rejects when response job_id does not match the requested id", async () => {
    clearControlPlaneTokenCache();
    const requested = "44444444-4444-4444-8444-444444444444";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({
        job_id: "55555555-5555-4555-8555-555555555555",
        status: "queued",
        result: null,
        error: null,
      });
    };
    await assert.rejects(
      () => getControlPlaneJob(config, requested, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a job/);
        return true;
      },
    );
  });
});

describe("nextProvisionJobPoll", () => {
  const base = {
    status: null as null,
    attempts: 0,
    consecutiveErrors: 0,
    everLeftQueued: false,
    deploymentTerminal: false,
  };

  it("keeps polling while status is active or unknown", () => {
    assert.deepEqual(nextProvisionJobPoll(base), { keepPolling: true });
    assert.deepEqual(
      nextProvisionJobPoll({ ...base, status: "queued", attempts: 1 }),
      { keepPolling: true },
    );
    assert.deepEqual(
      nextProvisionJobPoll({ ...base, status: "running", attempts: 2, everLeftQueued: true }),
      { keepPolling: true },
    );
  });

  it("stops on terminal job status", () => {
    assert.deepEqual(
      nextProvisionJobPoll({ ...base, status: "succeeded", attempts: 3, everLeftQueued: true }),
      { keepPolling: false, reason: "terminal" },
    );
    assert.deepEqual(
      nextProvisionJobPoll({ ...base, status: "failed", attempts: 1, everLeftQueued: true }),
      { keepPolling: false, reason: "terminal" },
    );
  });

  it("stops when the parent deployment is already terminal", () => {
    assert.deepEqual(
      nextProvisionJobPoll({ ...base, status: "queued", attempts: 1, deploymentTerminal: true }),
      { keepPolling: false, reason: "deployment_terminal" },
    );
  });

  it("stops forever-queued unknown/expired jobs as stale", () => {
    assert.deepEqual(
      nextProvisionJobPoll({
        ...base,
        status: "queued",
        attempts: PROVISION_JOB_POLL_MAX_QUEUED_ONLY,
        everLeftQueued: false,
      }),
      { keepPolling: false, reason: "stale" },
    );
    assert.deepEqual(
      nextProvisionJobPoll({
        ...base,
        status: "queued",
        attempts: PROVISION_JOB_POLL_MAX_QUEUED_ONLY,
        everLeftQueued: true,
      }),
      { keepPolling: true },
    );
  });

  it("stops after the hard attempt ceiling", () => {
    assert.deepEqual(
      nextProvisionJobPoll({
        ...base,
        status: "running",
        attempts: PROVISION_JOB_POLL_MAX_ATTEMPTS,
        everLeftQueued: true,
      }),
      { keepPolling: false, reason: "deadline" },
    );
  });

  it("stops after consecutive fetch errors", () => {
    assert.deepEqual(
      nextProvisionJobPoll({
        ...base,
        status: "running",
        attempts: 5,
        consecutiveErrors: PROVISION_JOB_POLL_MAX_CONSECUTIVE_ERRORS,
        everLeftQueued: true,
      }),
      { keepPolling: false, reason: "errors" },
    );
  });
});

describe("isSettledActiveProvisionJob", () => {
  it("marks forever-queued jobs on a finished deployment as settled", () => {
    assert.equal(isSettledActiveProvisionJob("deployment_terminal", "queued"), true);
    assert.equal(isSettledActiveProvisionJob("stale", "queued"), true);
    assert.equal(isSettledActiveProvisionJob("deadline", "running"), true);
    assert.equal(isSettledActiveProvisionJob("errors", "running"), true);
    assert.equal(isSettledActiveProvisionJob("terminal", "succeeded"), false);
    assert.equal(isSettledActiveProvisionJob("deployment_terminal", "succeeded"), false);
    assert.equal(isSettledActiveProvisionJob(null, "queued"), false);
  });

  it("explains deployment_terminal when the job never left active", () => {
    assert.match(provisionJobPollStopMessage("deployment_terminal"), /expired|queued/i);
  });

  it("labels settled badges by stop reason", () => {
    assert.equal(settledActiveJobBadgeLabel("stale"), "Stale");
    assert.equal(settledActiveJobBadgeLabel("deployment_terminal"), "Stale");
    assert.equal(settledActiveJobBadgeLabel("deadline"), "Stopped");
    assert.equal(settledActiveJobBadgeLabel("errors"), "Unavailable");
  });
});

describe("messageForPollStop", () => {
  it("explains stale and deployment_terminal stops, not quiet terminal", () => {
    assert.match(messageForPollStop("stale", "queued") ?? "", /expired|queued/i);
    assert.match(messageForPollStop("deployment_terminal", "queued") ?? "", /expired|queued/i);
    assert.equal(messageForPollStop("terminal", "succeeded"), null);
    assert.equal(messageForPollStop("errors", "running"), null);
  });
});

describe("fetchProvisionJob", () => {
  it("gets /api/console/jobs/{id} same-origin", async () => {
    const jobId = "44444444-4444-4444-8444-444444444444";
    let url = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      url = String(input);
      return jsonResponse({ job_id: jobId, status: "queued", result: null, error: null });
    }) as typeof fetch;
    try {
      const job = await fetchProvisionJob(jobId);
      assert.equal(url, `/api/console/jobs/${jobId}`);
      assert.equal(job.status, "queued");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({ detail: "Job queue is unavailable.", code: "queue_unavailable" }, 503)) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchProvisionJob("44444444-4444-4444-8444-444444444444"),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "Job queue is unavailable.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws SessionEnded on 401 so polling can stop", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({ detail: "Not signed in.", code: "unauthenticated" }, 401)) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchProvisionJob("44444444-4444-4444-8444-444444444444"),
        (cause: unknown) => {
          assert.ok(cause instanceof SessionEnded);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
