import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSandbox } from "./api";
import { jsonSandboxControlPlaneError } from "./console-sandbox-route";
import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  createControlPlaneSandbox,
} from "./control-plane";
import {
  SANDBOX_BOOT_FAILED,
  SANDBOX_HOST_UNAVAILABLE,
  SANDBOX_PROJECT_NOT_FOUND,
} from "./sandbox-input";

const config = {
  baseUrl: "https://cp.example",
  clientId: "console",
  clientSecret: "secret-value",
};

const projectId = "11111111-1111-4111-8111-111111111111";
const sandboxId = "22222222-2222-4222-8222-222222222222";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createControlPlaneSandbox", () => {
  it("posts sandbox creation with bearer and strips host_id and secrets", async () => {
    clearControlPlaneTokenCache();
    let method = "";
    let authorization = "";
    let posted: unknown;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      method = init?.method ?? "GET";
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      posted = JSON.parse(String(init?.body));
      assert.ok(url.endsWith(`/api/v1/projects/${projectId}/sandboxes`));
      return jsonResponse(
        {
          id: sandboxId,
          project_id: projectId,
          image: "alpine-3.20",
          vcpu: 2,
          memory_mib: 256,
          ttl_seconds: 1800,
          status: "running",
          expires_at: "2026-10-25T13:30:00Z",
          created_at: "2026-10-25T13:00:00Z",
          host_id: "33333333-3333-4333-8333-333333333333",
          hypervisor_vm_id: "vm-secret-id",
        },
        201,
      );
    };

    const sandbox = await createControlPlaneSandbox(
      config,
      {
        projectId,
        image: "alpine-3.20",
        vcpu: 2,
        memoryMib: 256,
        ttlSeconds: 1800,
      },
      { fetch: fetchImpl },
    );

    assert.equal(method, "POST");
    assert.equal(authorization, "Bearer issued-bearer");
    assert.deepEqual(posted, {
      image: "alpine-3.20",
      vcpu: 2,
      memory_mib: 256,
      ttl_seconds: 1800,
    });
    assert.deepEqual(sandbox, {
      id: sandboxId,
      project_id: projectId,
      image: "alpine-3.20",
      vcpu: 2,
      memory_mib: 256,
      ttl_seconds: 1800,
      status: "running",
      expires_at: "2026-10-25T13:30:00Z",
      created_at: "2026-10-25T13:00:00Z",
    });
    assert.equal(JSON.stringify(sandbox).includes("vm-secret-id"), false);
  });

  it("maps 503 sandbox_unavailable and 502 sandbox_failed without leaking upstream details", async () => {
    clearControlPlaneTokenCache();
    let statusToReturn = 503;
    let codeToReturn = "sandbox_unavailable";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse(
        { detail: "No enrolled sandbox host at http://10.0.20.4:8080", code: codeToReturn },
        statusToReturn,
      );
    };

    await assert.rejects(
      () =>
        createControlPlaneSandbox(
          config,
          {
            projectId,
            image: "alpine-3.20",
            vcpu: 1,
            memoryMib: 128,
            ttlSeconds: 3600,
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.code, "sandbox_unavailable");
        assert.equal(cause.message.includes("10.0.20.4"), false);
        return true;
      },
    );

    statusToReturn = 502;
    codeToReturn = "sandbox_failed";
    await assert.rejects(
      () =>
        createControlPlaneSandbox(
          config,
          {
            projectId,
            image: "alpine-3.20",
            vcpu: 1,
            memoryMib: 128,
            ttlSeconds: 3600,
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 502);
        assert.equal(cause.code, "sandbox_failed");
        assert.equal(cause.message.includes("10.0.20.4"), false);
        return true;
      },
    );
  });
});

describe("jsonSandboxControlPlaneError and createSandbox client helper", () => {
  it("maps 404, 503 sandbox_unavailable, and 502 sandbox_failed", async () => {
    const notFound = jsonSandboxControlPlaneError(
      new ControlPlaneError("not found", 404),
      "test_event",
    );
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), {
      detail: SANDBOX_PROJECT_NOT_FOUND,
      code: "not_found",
    });

    const unavailable = jsonSandboxControlPlaneError(
      new ControlPlaneError("unavailable", 503, undefined, { code: "sandbox_unavailable" }),
      "test_event",
    );
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      detail: SANDBOX_HOST_UNAVAILABLE,
      code: "sandbox_unavailable",
    });

    const failed = jsonSandboxControlPlaneError(
      new ControlPlaneError("failed", 502, undefined, { code: "sandbox_failed" }),
      "test_event",
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), {
      detail: SANDBOX_BOOT_FAILED,
      code: "sandbox_failed",
    });
  });

  it("posts to /api/console/sandboxes same-origin", async () => {
    let url = "";
    let method = "";
    let posted: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      url = String(input);
      method = init?.method ?? "GET";
      posted = JSON.parse(String(init?.body));
      return jsonResponse(
        {
          id: sandboxId,
          project_id: projectId,
          image: "alpine-3.20",
          vcpu: 1,
          memory_mib: 128,
          ttl_seconds: 3600,
          status: "running",
          expires_at: "2026-10-25T14:00:00Z",
          created_at: "2026-10-25T13:00:00Z",
        },
        201,
      );
    }) as typeof fetch;

    try {
      const created = await createSandbox({
        projectId,
        image: "alpine-3.20",
        vcpu: 1,
        memoryMib: 128,
        ttlSeconds: 3600,
      });
      assert.equal(url, "/api/console/sandboxes");
      assert.equal(method, "POST");
      assert.deepEqual(posted, {
        project_id: projectId,
        image: "alpine-3.20",
        vcpu: 1,
        memory_mib: 128,
        ttl_seconds: 3600,
      });
      assert.equal(created.id, sandboxId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
