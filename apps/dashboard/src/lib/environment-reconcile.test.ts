import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { queueEnvironmentReconcile } from "./api";
import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  reconcileControlPlaneEnvironment,
} from "./control-plane";

const config = {
  baseUrl: "https://cp.example",
  clientId: "console",
  clientSecret: "secret-value",
};

const projectId = "11111111-1111-4111-8111-111111111111";
const environmentId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("reconcileControlPlaneEnvironment", () => {
  it("posts reconcile with the bearer and returns the accepted job", async () => {
    clearControlPlaneTokenCache();
    let authorization = "";
    let method = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      method = init?.method ?? "GET";
      assert.ok(url.endsWith(`/environments/${environmentId}/reconcile`));
      return jsonResponse(
        {
          job_id: jobId,
          kind: "reconcile",
          project_id: projectId,
          environment_id: environmentId,
          status: "queued",
          secret: "super-secret",
        },
        202,
      );
    };
    const accepted = await reconcileControlPlaneEnvironment(config, projectId, environmentId, {
      fetch: fetchImpl,
    });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(method, "POST");
    assert.equal(accepted.job_id, jobId);
    assert.equal(accepted.kind, "reconcile");
    assert.equal(accepted.status, "queued");
    assert.equal(JSON.stringify(accepted).includes("super-secret"), false);
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
      () => reconcileControlPlaneEnvironment(config, projectId, environmentId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.message.includes("super-secret"), false);
        return true;
      },
    );
  });

  it("rejects when accept body kind or ids do not match", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse(
        {
          job_id: jobId,
          kind: "provision",
          project_id: projectId,
          environment_id: environmentId,
          status: "queued",
        },
        202,
      );
    };
    await assert.rejects(
      () => reconcileControlPlaneEnvironment(config, projectId, environmentId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a job/);
        return true;
      },
    );
  });
});

describe("queueEnvironmentReconcile", () => {
  it("posts same-origin reconcile and returns the accepted job", async () => {
    let url = "";
    let method = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      url = String(input);
      method = init?.method ?? "GET";
      return jsonResponse(
        {
          job_id: jobId,
          kind: "reconcile",
          project_id: projectId,
          environment_id: environmentId,
          status: "queued",
        },
        202,
      );
    }) as typeof fetch;
    try {
      const accepted = await queueEnvironmentReconcile(projectId, environmentId);
      assert.equal(
        url,
        `/api/console/projects/${projectId}/environments/${environmentId}/reconcile`,
      );
      assert.equal(method, "POST");
      assert.equal(accepted.job_id, jobId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps queue unavailable detail from a 503", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({ detail: "Job queue is unavailable.", code: "queue_unavailable" }, 503)) as typeof fetch;
    try {
      await assert.rejects(
        () => queueEnvironmentReconcile(projectId, environmentId),
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
});
