import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  listControlPlaneProjects,
  listControlPlaneSandboxes,
  openControlPlaneDeploymentLogs,
  readControlPlaneConfig,
  registerControlPlaneUser,
  type ControlPlaneConfig,
} from "./control-plane";

const config: ControlPlaneConfig = {
  baseUrl: "http://127.0.0.1:8000",
  clientId: "console",
  clientSecret: "super-secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readControlPlaneConfig", () => {
  it("requires an origin and both client credentials", () => {
    assert.equal(readControlPlaneConfig({}), null);
    assert.equal(
      readControlPlaneConfig({
        CONTROL_PLANE_URL: "http://127.0.0.1:8000",
        CONTROL_PLANE_CLIENT_ID: "console",
      }),
      null,
    );
    assert.equal(
      readControlPlaneConfig({
        CONTROL_PLANE_URL: "ftp://127.0.0.1:8000",
        CONTROL_PLANE_CLIENT_ID: "console",
        CONTROL_PLANE_CLIENT_SECRET: "secret",
      }),
      null,
    );
    assert.deepEqual(
      readControlPlaneConfig({
        CONTROL_PLANE_URL: "http://127.0.0.1:8000/",
        CONTROL_PLANE_CLIENT_ID: "console",
        CONTROL_PLANE_CLIENT_SECRET: "secret",
      }),
      {
        baseUrl: "http://127.0.0.1:8000",
        clientId: "console",
        clientSecret: "secret",
      },
    );
  });
});

describe("listControlPlaneProjects", () => {
  it("sends the client secret only to the token endpoint and reuses the bearer", async () => {
    clearControlPlaneTokenCache();
    const calls: { url: string; authorization?: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        authorization: headers.get("authorization") ?? undefined,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({
          access_token: "issued-bearer",
          token_type: "Bearer",
          expires_in: 900,
        });
      }
      return jsonResponse({
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "payments",
            name: "Payments",
            description: null,
            created_at: "2026-10-18T00:00:00.000Z",
            updated_at: "2026-10-18T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      });
    };

    const first = await listControlPlaneProjects(config, { fetch: fetchImpl });
    const second = await listControlPlaneProjects(config, { fetch: fetchImpl });

    assert.equal(first.total, 1);
    assert.equal(first.items[0]?.slug, "payments");
    assert.deepEqual(second.items, first.items);
    assert.equal(calls.filter((call) => call.url.endsWith("/api/v1/auth/token")).length, 1);
    assert.equal(calls[0]?.body?.includes("super-secret"), true);
    assert.equal(calls[1]?.authorization, "Bearer issued-bearer");
    assert.equal(calls[1]?.body, undefined);
    assert.equal(calls[2]?.authorization, "Bearer issued-bearer");
    assert.equal(JSON.stringify(first).includes("issued-bearer"), false);
    assert.equal(JSON.stringify(first).includes("super-secret"), false);
  });

  it("refreshes a bearer that is inside the skew window", async () => {
    clearControlPlaneTokenCache();
    let tokens = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).endsWith("/api/v1/auth/token")) {
        tokens += 1;
        return jsonResponse({ access_token: `bearer-${tokens}`, expires_in: 10 });
      }
      return jsonResponse({ items: [], total: 0, limit: 200, offset: 0 });
    };

    await listControlPlaneProjects(config, { fetch: fetchImpl, now: () => 1_000 });
    await listControlPlaneProjects(config, { fetch: fetchImpl, now: () => 2_000 });
    assert.equal(tokens, 2);
  });

  it("does not include the upstream body in a failed token error", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ detail: "nope", client_secret: "super-secret" }, 401);

    await assert.rejects(
      () => listControlPlaneProjects(config, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /token request failed \(401\)/);
        return true;
      },
    );
  });
});

const projectRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "payments",
  name: "Payments",
  description: null,
  created_at: "2026-10-18T00:00:00.000Z",
  updated_at: "2026-10-18T00:00:00.000Z",
};

const sandboxRow = {
  id: "33333333-3333-4333-8333-333333333333",
  project_id: projectRow.id,
  image: "debian-slim",
  vcpu: 1,
  memory_mib: 128,
  ttl_seconds: 3600,
  status: "running",
  expires_at: "2026-10-18T01:00:00.000Z",
  created_at: "2026-10-18T00:00:00.000Z",
  host_id: null,
};

describe("listControlPlaneSandboxes", () => {
  it("lists every project's sandboxes with one bearer", async () => {
    clearControlPlaneTokenCache();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const headers = new Headers(init?.headers);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.includes("/api/v1/projects?")) {
        assert.equal(headers.get("authorization"), "Bearer issued-bearer");
        return jsonResponse({
          items: [
            projectRow,
            { ...projectRow, id: "22222222-2222-4222-8222-222222222222", slug: "platform" },
          ],
          total: 2,
          limit: 200,
          offset: 0,
        });
      }
      assert.equal(headers.get("authorization"), "Bearer issued-bearer");
      if (url.includes(projectRow.id) && url.includes("offset=0")) {
        return jsonResponse({ items: [sandboxRow], total: 2, limit: 200, offset: 0 });
      }
      if (url.includes(projectRow.id)) {
        return jsonResponse({
          items: [{ ...sandboxRow, id: "44444444-4444-4444-8444-444444444444" }],
          total: 2,
          limit: 200,
          offset: 1,
        });
      }
      return jsonResponse({ items: [], total: 0, limit: 200, offset: 0 });
    };

    const page = await listControlPlaneSandboxes(config, { fetch: fetchImpl });
    assert.equal(page.total, 2);
    assert.equal(page.items[0]?.image, "debian-slim");
    assert.equal(calls.filter((url) => url.endsWith("/api/v1/auth/token")).length, 1);
    assert.equal(calls.filter((url) => url.includes("/sandboxes?")).length, 3);
    assert.equal(JSON.stringify(page).includes("super-secret"), false);
    assert.equal(JSON.stringify(page).includes("issued-bearer"), false);
  });

  it("does not include the upstream body when a sandbox list fails", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.includes("/api/v1/projects?")) {
        return jsonResponse({ items: [projectRow], total: 1, limit: 200, offset: 0 });
      }
      return jsonResponse({ detail: "nope", client_secret: "super-secret" }, 503);
    };

    await assert.rejects(
      () => listControlPlaneSandboxes(config, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /sandboxes request failed \(503\)/);
        return true;
      },
    );
  });
});

describe("openControlPlaneDeploymentLogs", () => {
  it("streams the stub lines with one bearer", async () => {
    clearControlPlaneTokenCache();
    const deploymentId = "33333333-3333-4333-8333-333333333333";
    let authorization = "";
    let logsUrl = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      logsUrl = url;
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(
        "data: Initializing Terraform...\n\ndata: Provisioning K3s...\n\ndata: Done\n\n",
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };

    const body = await openControlPlaneDeploymentLogs(config, deploymentId, {
      fetch: fetchImpl,
    });
    const text = await new Response(body).text();
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(
      logsUrl,
      `http://127.0.0.1:8000/api/v1/deployments/${deploymentId}/logs`,
    );
    assert.match(text, /Initializing Terraform\.\.\./);
    assert.match(text, /Provisioning K3s\.\.\./);
    assert.match(text, /\n\ndata: Done\n\n/);
    assert.equal(text.includes("super-secret"), false);
    assert.equal(text.includes("issued-bearer"), false);
  });

  it("does not call upstream for a non-uuid id", async () => {
    clearControlPlaneTokenCache();
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(
      () => openControlPlaneDeploymentLogs(config, "not-a-uuid", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a uuid/);
        return true;
      },
    );
    assert.equal(called, false);
  });

  it("does not include the upstream body when the log stream fails", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "nope", client_secret: "super-secret" }, 502);
    };
    await assert.rejects(
      () =>
        openControlPlaneDeploymentLogs(
          config,
          "33333333-3333-4333-8333-333333333333",
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /deployment logs request failed \(502\)/);
        return true;
      },
    );
  });
});

describe("registerControlPlaneUser", () => {
  it("posts the account with the bearer and returns no secret", async () => {
    clearControlPlaneTokenCache();
    const password = "correct-horse";
    let authorization = "";
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      posted = typeof init?.body === "string" ? init.body : "";
      return jsonResponse({
        id: "55555555-5555-4555-8555-555555555555",
        email: "ada@example.com",
        created_at: "2026-10-18T00:00:00.000Z",
        updated_at: "2026-10-18T00:00:00.000Z",
        password_hash: "scrypt$hidden",
      });
    };

    const user = await registerControlPlaneUser(config, "Ada@Example.com", password, {
      fetch: fetchImpl,
    });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(posted.includes(password), true);
    assert.equal(user.email, "ada@example.com");
    assert.equal(JSON.stringify(user).includes(password), false);
    assert.equal(JSON.stringify(user).includes("password_hash"), false);
    assert.equal(JSON.stringify(user).includes("super-secret"), false);
  });

  it("does not include the upstream body when registration fails", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "nope", password: "correct-horse" }, 409);
    };
    await assert.rejects(
      () => registerControlPlaneUser(config, "ada@example.com", "correct-horse", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("correct-horse"), false);
        assert.match(cause.message, /conflict \(409\)/);
        return true;
      },
    );
  });
});
