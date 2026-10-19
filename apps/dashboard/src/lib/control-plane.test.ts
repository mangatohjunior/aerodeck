import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jsonControlPlaneError } from "./mock-http";
import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  listControlPlaneProjects,
  listControlPlaneSandboxes,
  listControlPlaneEnvironments,
  openControlPlaneDeploymentLogs,
  succeedControlPlaneDeployment,
  failControlPlaneDeployment,
  readControlPlaneConfig,
  authenticateControlPlaneUser,
  createControlPlaneDeployment,
  createControlPlaneDeploymentAndProvision,
  createControlPlaneProject,
  createControlPlaneEnvironment,
  deleteControlPlaneEnvironment,
  deleteControlPlaneProject,
  getControlPlaneProjectDetail,
  getControlPlaneDeployment,
  updateControlPlaneEnvironment,
  updateControlPlaneProject,
  createControlPlaneSession,
  linkControlPlaneGoogleUser,
  listControlPlaneDeployments,
  readControlPlaneSession,
  revokeControlPlaneSession,
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

describe("jsonControlPlaneError", () => {
  it("maps a missing deployment to 404 and other failures to 502", async () => {
    const missing = jsonControlPlaneError(
      new ControlPlaneError("control plane deployment was not found (404)", 404),
      "console_deployment_read_failed",
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { detail: "Deployment not found.", code: "not_found" });

    const failed = jsonControlPlaneError(
      new ControlPlaneError("control plane deployment request failed (503)", 503),
      "console_deployment_read_failed",
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), {
      detail: "Control plane request failed.",
      code: "control_plane_unavailable",
    });
  });

  it("maps 503 to queue_unavailable when a queue detail is provided", async () => {
    const unavailable = jsonControlPlaneError(
      new ControlPlaneError("control plane job queue unavailable (503)", 503),
      "console_job_read_failed",
      "Job not found.",
      "Job queue is unavailable.",
    );
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      detail: "Job queue is unavailable.",
      code: "queue_unavailable",
    });
  });
});

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

  it("pages through projects past the first limit", async () => {
    clearControlPlaneTokenCache();
    const first = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "payments",
      name: "Payments",
      description: null,
      created_at: "2026-10-18T00:00:00.000Z",
      updated_at: "2026-10-18T00:00:00.000Z",
    };
    const second = {
      ...first,
      id: "22222222-2222-4222-8222-222222222222",
      slug: "platform",
      name: "Platform",
    };
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      urls.push(url);
      if (url.includes("offset=0")) {
        return jsonResponse({ items: [first], total: 2, limit: 200, offset: 0 });
      }
      if (url.includes("offset=1")) {
        return jsonResponse({ items: [second], total: 2, limit: 200, offset: 1 });
      }
      return jsonResponse({ items: [], total: 2, limit: 200, offset: 2 });
    };

    const page = await listControlPlaneProjects(config, { fetch: fetchImpl });
    assert.equal(page.total, 2);
    assert.deepEqual(
      page.items.map((row) => row.slug),
      ["payments", "platform"],
    );
    assert.equal(urls.filter((url) => url.includes("/api/v1/projects?")).length, 2);
  });

  it("throws when the project list exceeds the page cap", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      // Always return one item and a huge total so the cap loop never finishes.
      const offsetMatch = /offset=(\d+)/.exec(url);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      return jsonResponse({
        items: [
          {
            id: `11111111-1111-4111-8111-${String(offset).padStart(12, "0")}`,
            slug: `p-${offset}`,
            name: `Project ${offset}`,
            description: null,
            created_at: "2026-10-18T00:00:00.000Z",
            updated_at: "2026-10-18T00:00:00.000Z",
          },
        ],
        total: 10_000,
        limit: 200,
        offset,
      });
    };

    await assert.rejects(
      () => listControlPlaneProjects(config, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /exceeded page cap/);
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

const environmentRow = {
  id: "55555555-5555-4555-8555-555555555555",
  project_id: projectRow.id,
  slug: "prod",
  name: "Prod",
  kind: "prod",
  region: "ams3",
  created_at: "2026-10-18T00:00:00.000Z",
  updated_at: "2026-10-18T00:00:00.000Z",
};

describe("listControlPlaneEnvironments", () => {
  it("lists every project's environments with one bearer", async () => {
    clearControlPlaneTokenCache();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const headers = new Headers(init?.headers);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.includes("/api/v1/projects?") && !url.includes("/environments")) {
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
        return jsonResponse({ items: [environmentRow], total: 2, limit: 200, offset: 0 });
      }
      if (url.includes(projectRow.id)) {
        return jsonResponse({
          items: [{ ...environmentRow, id: "66666666-6666-4666-8666-666666666666", slug: "staging" }],
          total: 2,
          limit: 200,
          offset: 1,
        });
      }
      return jsonResponse({ items: [], total: 0, limit: 200, offset: 0 });
    };

    const items = await listControlPlaneEnvironments(config, { fetch: fetchImpl });
    assert.equal(items.length, 2);
    assert.equal(items[0]?.slug, "prod");
    assert.equal(items[0]?.project_slug, "payments");
    assert.equal(calls.filter((url) => url.endsWith("/api/v1/auth/token")).length, 1);
    assert.equal(calls.filter((url) => url.includes("/environments?")).length, 3);
    assert.equal(JSON.stringify(items).includes("super-secret"), false);
  });

  it("does not include the upstream body when an environment list fails", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.includes("/api/v1/projects?") && !url.includes("/environments")) {
        return jsonResponse({ items: [projectRow], total: 1, limit: 200, offset: 0 });
      }
      return jsonResponse({ detail: "nope", client_secret: "super-secret" }, 503);
    };

    await assert.rejects(
      () => listControlPlaneEnvironments(config, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /environments request failed \(503\)/);
        return true;
      },
    );
  });

  it("rejects a malformed environments page", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.includes("/api/v1/projects?") && !url.includes("/environments")) {
        return jsonResponse({ items: [projectRow], total: 1, limit: 200, offset: 0 });
      }
      return jsonResponse({ items: "nope" });
    };

    await assert.rejects(
      () => listControlPlaneEnvironments(config, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /was not a page/);
        return true;
      },
    );
  });
});

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

  it("does not include the upstream body when the deployment is missing", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
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
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );
  });
});

describe("createControlPlaneProject", () => {
  it("posts slug and name with the bearer and omits a blank description", async () => {
    clearControlPlaneTokenCache();
    let authorization = "";
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      posted = String(init?.body ?? "");
      assert.equal(init?.method, "POST");
      assert.ok(url.endsWith("/api/v1/projects"));
      return jsonResponse({
        id: "11111111-1111-4111-8111-111111111111",
        slug: "payments",
        name: "Payments",
        description: null,
        created_at: "2026-10-19T00:00:00.000Z",
        updated_at: "2026-10-19T00:00:00.000Z",
      }, 201);
    };

    const project = await createControlPlaneProject(
      config,
      { slug: "payments", name: "Payments", description: "  " },
      { fetch: fetchImpl },
    );
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(posted, JSON.stringify({ slug: "payments", name: "Payments" }));
    assert.equal(project.slug, "payments");
    assert.equal(project.description, null);
  });

  it("includes a trimmed description when set", async () => {
    clearControlPlaneTokenCache();
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      posted = String(init?.body ?? "");
      return jsonResponse({
        id: "11111111-1111-4111-8111-111111111111",
        slug: "billing",
        name: "Billing",
        description: "Card rails",
        created_at: "2026-10-19T00:00:00.000Z",
        updated_at: "2026-10-19T00:00:00.000Z",
      }, 201);
    };

    const project = await createControlPlaneProject(
      config,
      { slug: "billing", name: "Billing", description: "  Card rails  " },
      { fetch: fetchImpl },
    );
    assert.equal(
      posted,
      JSON.stringify({ slug: "billing", name: "Billing", description: "Card rails" }),
    );
    assert.equal(project.description, "Card rails");
  });

  it("maps conflict and validation failures without leaking upstream bodies", async () => {
    clearControlPlaneTokenCache();
    const conflictFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "taken", secret: "super-secret" }, 409);
    };
    await assert.rejects(
      () =>
        createControlPlaneProject(
          config,
          { slug: "payments", name: "Payments" },
          { fetch: conflictFetch },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 409);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /conflict \(409\)/);
        return true;
      },
    );

    clearControlPlaneTokenCache();
    const invalidFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "Payments!", secret: "super-secret" }, 422);
    };
    await assert.rejects(
      () =>
        createControlPlaneProject(
          config,
          { slug: "Payments!", name: "Payments" },
          { fetch: invalidFetch },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 422);
        assert.equal(cause.message.includes("Payments!"), false);
        assert.match(cause.message, /rejected \(422\)/);
        return true;
      },
    );
  });
});

describe("updateControlPlaneProject", () => {
  it("patches name and description with the bearer", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      assert.equal(init?.method, "PATCH");
      posted = String(init?.body ?? "");
      return jsonResponse({
        id: projectId,
        slug: "payments",
        name: "Payments HQ",
        description: "Ledger",
        created_at: "2026-10-19T00:00:00.000Z",
        updated_at: "2026-10-19T01:00:00.000Z",
      });
    };
    const project = await updateControlPlaneProject(
      config,
      { projectId, name: "Payments HQ", description: "Ledger" },
      { fetch: fetchImpl },
    );
    assert.equal(project.name, "Payments HQ");
    assert.equal(posted, JSON.stringify({ name: "Payments HQ", description: "Ledger" }));
  });
});

describe("deleteControlPlaneProject", () => {
  it("deletes with the bearer and discards a 204 body", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    let method = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      method = init?.method ?? "";
      return new Response(null, { status: 204 });
    };
    await deleteControlPlaneProject(config, projectId, { fetch: fetchImpl });
    assert.equal(method, "DELETE");
  });
});

describe("updateControlPlaneEnvironment", () => {
  it("loads the project then patches the environment", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/api/v1/projects/${projectId}`) && (init?.method ?? "GET") === "GET") {
        return jsonResponse({
          id: projectId,
          slug: "payments",
          name: "Payments",
          description: null,
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        });
      }
      assert.equal(init?.method, "PATCH");
      posted = String(init?.body ?? "");
      return jsonResponse({
        id: environmentId,
        project_id: projectId,
        slug: "prod",
        name: "Production EU",
        kind: "prod",
        region: "ams3",
        created_at: "2026-10-19T00:00:00.000Z",
        updated_at: "2026-10-19T01:00:00.000Z",
      });
    };
    const environment = await updateControlPlaneEnvironment(
      config,
      { projectId, environmentId, name: "Production EU", region: "ams3" },
      { fetch: fetchImpl },
    );
    assert.equal(environment.name, "Production EU");
    assert.equal(environment.project_slug, "payments");
    assert.equal(posted, JSON.stringify({ name: "Production EU", region: "ams3" }));
  });
});

describe("deleteControlPlaneEnvironment", () => {
  it("deletes the environment with the bearer", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    let method = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      method = init?.method ?? "";
      assert.ok(url.includes(`/environments/${environmentId}`));
      return new Response(null, { status: 204 });
    };
    await deleteControlPlaneEnvironment(config, projectId, environmentId, { fetch: fetchImpl });
    assert.equal(method, "DELETE");
  });
});

describe("getControlPlaneProjectDetail", () => {
  it("loads the project and its environments with one bearer", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/api/v1/projects/${projectId}`) && !url.includes("/environments")) {
        return jsonResponse({
          id: projectId,
          slug: "payments",
          name: "Payments",
          description: null,
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        });
      }
      if (url.includes(`/projects/${projectId}/environments`)) {
        return jsonResponse({
          items: [
            {
              id: environmentId,
              project_id: projectId,
              slug: "prod",
              name: "Production",
              kind: "prod",
              region: "ams3",
              created_at: "2026-10-19T00:00:00.000Z",
              updated_at: "2026-10-19T00:00:00.000Z",
            },
          ],
          total: 1,
          limit: 200,
          offset: 0,
        });
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    const detail = await getControlPlaneProjectDetail(config, projectId, { fetch: fetchImpl });
    assert.equal(detail.project.slug, "payments");
    assert.equal(detail.environments.length, 1);
    assert.equal(detail.environments[0]?.slug, "prod");
    assert.equal(detail.environments[0]?.project_slug, "payments");
  });

  it("maps a missing project without leaking upstream bodies", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
    };
    await assert.rejects(
      () => getControlPlaneProjectDetail(config, projectId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 404);
        assert.equal(cause.message.includes("super-secret"), false);
        return true;
      },
    );
  });
});

describe("createControlPlaneEnvironment", () => {
  it("loads the project then posts the environment with the bearer", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const calls: string[] = [];
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith(`/api/v1/projects/${projectId}`) && (init?.method ?? "GET") === "GET") {
        return jsonResponse({
          id: projectId,
          slug: "payments",
          name: "Payments",
          description: null,
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        });
      }
      if (url.endsWith(`/projects/${projectId}/environments`) && init?.method === "POST") {
        posted = String(init.body ?? "");
        return jsonResponse(
          {
            id: environmentId,
            project_id: projectId,
            slug: "prod",
            name: "Production",
            kind: "prod",
            region: "ams3",
            created_at: "2026-10-19T00:00:00.000Z",
            updated_at: "2026-10-19T00:00:00.000Z",
          },
          201,
        );
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    const environment = await createControlPlaneEnvironment(
      config,
      {
        projectId,
        slug: "prod",
        name: "Production",
        kind: "prod",
        region: "ams3",
      },
      { fetch: fetchImpl },
    );
    assert.equal(environment.id, environmentId);
    assert.equal(environment.project_slug, "payments");
    assert.equal(environment.project_name, "Payments");
    assert.equal(
      posted,
      JSON.stringify({ slug: "prod", name: "Production", kind: "prod", region: "ams3" }),
    );
    assert.ok(calls.some((call) => call.startsWith("GET") && call.includes(`/projects/${projectId}`)));
    assert.ok(calls.some((call) => call.startsWith("POST") && call.includes("/environments")));
  });

  it("does not create when the project is missing", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    let created = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/api/v1/projects/${projectId}`)) {
        return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
      }
      if (url.includes("/environments") && init?.method === "POST") {
        created = true;
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    await assert.rejects(
      () =>
        createControlPlaneEnvironment(
          config,
          {
            projectId,
            slug: "prod",
            name: "Production",
            kind: "prod",
            region: "nyc3",
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 404);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );
    assert.equal(created, false);
  });

  it("maps conflict without leaking upstream bodies", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/api/v1/projects/${projectId}`) && (init?.method ?? "GET") === "GET") {
        return jsonResponse({
          id: projectId,
          slug: "payments",
          name: "Payments",
          description: null,
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        });
      }
      return jsonResponse({ detail: "taken", secret: "super-secret" }, 409);
    };

    await assert.rejects(
      () =>
        createControlPlaneEnvironment(
          config,
          {
            projectId,
            slug: "prod",
            name: "Production",
            kind: "prod",
            region: "nyc3",
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 409);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /conflict \(409\)/);
        return true;
      },
    );
  });
});

describe("createControlPlaneDeploymentAndProvision", () => {
  it("resolves the environment, creates the deployment, then queues provision", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "33333333-3333-4333-8333-333333333333";
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith(`/projects/${projectId}/environments/${environmentId}`)) {
        return jsonResponse({
          id: environmentId,
          project_id: projectId,
          slug: "prod",
          name: "Prod",
          kind: "prod",
          region: "ams3",
          created_at: "2026-10-18T00:00:00.000Z",
          updated_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith("/api/v1/deployments") && init?.method === "POST") {
        assert.equal(
          init.body,
          JSON.stringify({
            repo_url: "https://github.com/acme/payments",
            project_id: projectId,
            environment_id: environmentId,
          }),
        );
        return jsonResponse({
          id: deploymentId,
          repo_url: "https://github.com/acme/payments",
          owner: "acme",
          repo: "payments",
          project_id: projectId,
          environment_id: environmentId,
          status: "running",
          started_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith(`/environments/${environmentId}/provision`) && init?.method === "POST") {
        assert.equal(init.body, JSON.stringify({ deployment_id: deploymentId }));
        return jsonResponse({
          job_id: "44444444-4444-4444-8444-444444444444",
          kind: "provision",
          project_id: projectId,
          environment_id: environmentId,
          status: "queued",
        });
      }
      return jsonResponse({ detail: "unexpected", secret: "super-secret" }, 500);
    };

    const deployment = await createControlPlaneDeploymentAndProvision(
      config,
      {
        repoUrl: "https://github.com/acme/payments",
        projectId,
        environmentId,
      },
      { fetch: fetchImpl },
    );
    assert.equal(deployment.id, deploymentId);
    assert.equal(deployment.project_id, projectId);
    assert.equal(deployment.environment_id, environmentId);
    assert.ok(calls.some((call) => call.includes(`/environments/${environmentId}`) && call.startsWith("GET")));
    assert.ok(calls.some((call) => call.includes("/api/v1/deployments") && call.startsWith("POST")));
    assert.ok(calls.some((call) => call.includes("/provision") && call.startsWith("POST")));
  });

  it("does not create a deployment when the environment is missing", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    let created = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/environments/${environmentId}`)) {
        return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
      }
      if (url.endsWith("/api/v1/deployments") && init?.method === "POST") {
        created = true;
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    await assert.rejects(
      () =>
        createControlPlaneDeploymentAndProvision(
          config,
          {
            repoUrl: "https://github.com/acme/payments",
            projectId,
            environmentId,
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );
    assert.equal(created, false);
  });

  it("attaches the deployment id when provision enqueue fails after create", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "33333333-3333-4333-8333-333333333333";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/environments/${environmentId}`) && (init?.method ?? "GET") === "GET") {
        return jsonResponse({
          id: environmentId,
          project_id: projectId,
          slug: "prod",
          name: "Prod",
          kind: "prod",
          region: "ams3",
          created_at: "2026-10-18T00:00:00.000Z",
          updated_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith("/api/v1/deployments") && init?.method === "POST") {
        return jsonResponse({
          id: deploymentId,
          repo_url: "https://github.com/acme/payments",
          owner: "acme",
          repo: "payments",
          status: "running",
          started_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith(`/environments/${environmentId}/provision`) && init?.method === "POST") {
        return jsonResponse({ detail: "queue down", secret: "super-secret" }, 503);
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    await assert.rejects(
      () =>
        createControlPlaneDeploymentAndProvision(
          config,
          {
            repoUrl: "https://github.com/acme/payments",
            projectId,
            environmentId,
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.deploymentId, deploymentId);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /queue unavailable \(503\)/);
        assert.ok(cause.cause instanceof ControlPlaneError);
        return true;
      },
    );
  });

  it("attaches the deployment id when provision throws a non-ControlPlaneError", async () => {
    clearControlPlaneTokenCache();
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "33333333-3333-4333-8333-333333333333";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/environments/${environmentId}`) && (init?.method ?? "GET") === "GET") {
        return jsonResponse({
          id: environmentId,
          project_id: projectId,
          slug: "prod",
          name: "Prod",
          kind: "prod",
          region: "ams3",
          created_at: "2026-10-18T00:00:00.000Z",
          updated_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith("/api/v1/deployments") && init?.method === "POST") {
        return jsonResponse({
          id: deploymentId,
          repo_url: "https://github.com/acme/payments",
          owner: "acme",
          repo: "payments",
          status: "running",
          started_at: "2026-10-18T00:00:00.000Z",
        });
      }
      if (url.endsWith(`/environments/${environmentId}/provision`) && init?.method === "POST") {
        throw new TypeError("network down");
      }
      return jsonResponse({ detail: "unexpected" }, 500);
    };

    await assert.rejects(
      () =>
        createControlPlaneDeploymentAndProvision(
          config,
          {
            repoUrl: "https://github.com/acme/payments",
            projectId,
            environmentId,
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 502);
        assert.equal(cause.deploymentId, deploymentId);
        assert.match(cause.message, /network down/);
        assert.ok(cause.cause instanceof TypeError);
        return true;
      },
    );
  });
});

describe("succeedControlPlaneDeployment", () => {
  it("records succeeded with the bearer and drops a missing body", async () => {
    clearControlPlaneTokenCache();
    const deploymentId = "66666666-6666-4666-8666-666666666666";
    let method = "";
    let authorization = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      method = init?.method ?? "";
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      if (url.endsWith(`/deployments/${deploymentId}/succeeded`)) {
        return jsonResponse({
          id: deploymentId,
          repo_url: "https://github.com/mangatohjunior/aerodeck",
          owner: "mangatohjunior",
          repo: "aerodeck",
          status: "succeeded",
          started_at: "2026-10-18T00:00:00.000Z",
        });
      }
      return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
    };

    const stored = await succeedControlPlaneDeployment(config, deploymentId, { fetch: fetchImpl });
    assert.equal(method, "POST");
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(stored.status, "succeeded");
    assert.equal(JSON.stringify(stored).includes("super-secret"), false);

    await assert.rejects(
      () =>
        succeedControlPlaneDeployment(config, "77777777-7777-4777-8777-777777777777", {
          fetch: fetchImpl,
        }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );
  });
});

describe("failControlPlaneDeployment", () => {
  it("records failed with the bearer", async () => {
    clearControlPlaneTokenCache();
    const deploymentId = "66666666-6666-4666-8666-666666666666";
    let method = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      method = init?.method ?? "";
      if (url.endsWith(`/deployments/${deploymentId}/failed`)) {
        return jsonResponse({
          id: deploymentId,
          repo_url: "https://github.com/mangatohjunior/aerodeck",
          owner: "mangatohjunior",
          repo: "aerodeck",
          status: "failed",
          started_at: "2026-10-18T00:00:00.000Z",
        });
      }
      return jsonResponse({ detail: "missing" }, 404);
    };

    const stored = await failControlPlaneDeployment(config, deploymentId, { fetch: fetchImpl });
    assert.equal(method, "POST");
    assert.equal(stored.status, "failed");
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

describe("authenticateControlPlaneUser", () => {
  it("posts the password with the bearer and returns no secret", async () => {
    clearControlPlaneTokenCache();
    const password = "correct-horse";
    let authorization = "";
    let posted = "";
    let loginUrl = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      loginUrl = url;
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      posted = typeof init?.body === "string" ? init.body : "";
      return jsonResponse({
        id: "55555555-5555-4555-8555-555555555555",
        email: "ada@example.com",
        created_at: "2026-10-18T00:00:00.000Z",
        password_hash: "scrypt$hidden",
      });
    };

    const user = await authenticateControlPlaneUser(config, "Ada@Example.com", password, {
      fetch: fetchImpl,
    });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.equal(loginUrl.endsWith("/api/v1/console-users/login"), true);
    assert.match(posted, /correct-horse/);
    assert.equal(user.email, "ada@example.com");
    assert.equal(JSON.stringify(user).includes("password_hash"), false);
    assert.equal(JSON.stringify(user).includes("super-secret"), false);
  });

  it("uses one message for a rejected login and drops the upstream body", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse(
        { detail: "Invalid email or password", code: "invalid_credentials", password: "correct-horse" },
        401,
      );
    };
    await assert.rejects(
      () => authenticateControlPlaneUser(config, "ada@example.com", "correct-horse", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("correct-horse"), false);
        assert.equal(cause.message.includes("ada@example.com"), false);
        assert.match(cause.message, /login rejected \(401\)/);
        return true;
      },
    );
  });
});

const deploymentRow = {
  id: "66666666-6666-4666-8666-666666666666",
  repo_url: "https://github.com/mangatohjunior/aerodeck",
  owner: "mangatohjunior",
  repo: "aerodeck",
  status: "running",
  started_at: "2026-10-18T00:00:00.000Z",
  created_at: "2026-10-18T00:00:00.000Z",
  updated_at: "2026-10-18T00:00:00.000Z",
};

describe("control plane deployments", () => {
  it("creates and lists a deployment with one bearer and no secret in the result", async () => {
    clearControlPlaneTokenCache();
    let authorization = "";
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      if (init?.method === "POST") {
        posted = typeof init.body === "string" ? init.body : "";
        return jsonResponse(deploymentRow, 201);
      }
      return jsonResponse({ items: [deploymentRow], total: 1, limit: 200, offset: 0 });
    };

    const created = await createControlPlaneDeployment(config, "https://github.com/mangatohjunior/aerodeck?token=secret", {
      fetch: fetchImpl,
    });
    const listed = await listControlPlaneDeployments(config, { fetch: fetchImpl });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.match(posted, /github.com\/mangatohjunior\/aerodeck/);
    assert.equal(JSON.stringify(created).includes("secret"), false);
    assert.equal(JSON.stringify(created).includes("super-secret"), false);
    assert.equal(listed[0]?.id, deploymentRow.id);
  });

  it("rejects a partial environment link on create", async () => {
    clearControlPlaneTokenCache();
    await assert.rejects(
      () =>
        createControlPlaneDeployment(config, "https://github.com/mangatohjunior/aerodeck", {
          projectId: "11111111-1111-4111-8111-111111111111",
          fetch: async () => {
            throw new Error("must not call fetch");
          },
        }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /both be set or both omitted/);
        return true;
      },
    );
  });

  it("rejects a one-sided environment link in a deployment response", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({
        ...deploymentRow,
        project_id: "11111111-1111-4111-8111-111111111111",
        environment_id: null,
      });
    };
    await assert.rejects(
      () => getControlPlaneDeployment(config, deploymentRow.id, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.match(cause.message, /not a deployment/);
        return true;
      },
    );
  });

  it("does not include the upstream body when create fails", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "nope", repo_url: "https://gitlab.com/org/repo" }, 422);
    };
    await assert.rejects(
      () => createControlPlaneDeployment(config, "https://gitlab.com/org/repo", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("gitlab.com"), false);
        assert.match(cause.message, /rejected \(422\)/);
        return true;
      },
    );
  });

  it("reads one deployment and hides a missing row", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      if (url.endsWith(`/deployments/${deploymentRow.id}`)) {
        return jsonResponse(deploymentRow);
      }
      return jsonResponse({ detail: "missing", secret: "super-secret" }, 404);
    };
    const found = await getControlPlaneDeployment(config, deploymentRow.id, { fetch: fetchImpl });
    assert.equal(found.repo, "aerodeck");
    assert.equal(found.provision_job_id, undefined);
    await assert.rejects(
      () => getControlPlaneDeployment(config, "77777777-7777-4777-8777-777777777777", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("super-secret"), false);
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );
  });

  it("keeps provision_job_id when the control plane returns it", async () => {
    clearControlPlaneTokenCache();
    const jobId = "44444444-4444-4444-8444-444444444444";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ ...deploymentRow, provision_job_id: jobId });
    };
    const found = await getControlPlaneDeployment(config, deploymentRow.id, { fetch: fetchImpl });
    assert.equal(found.provision_job_id, jobId);
  });

  it("keeps an explicit null provision_job_id from list/get", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ ...deploymentRow, provision_job_id: null });
    };
    const found = await getControlPlaneDeployment(config, deploymentRow.id, { fetch: fetchImpl });
    assert.equal(found.provision_job_id, null);
  });
});

describe("linkControlPlaneGoogleUser", () => {
  it("posts the subject with the bearer and does not return it", async () => {
    clearControlPlaneTokenCache();
    const subject = "google-subject-1";
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
        google_subject: subject,
        password_hash: null,
      });
    };

    const user = await linkControlPlaneGoogleUser(config, "Ada@Example.com", subject, {
      fetch: fetchImpl,
    });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.match(posted, /google-subject-1/);
    assert.equal(JSON.stringify(user).includes(subject), false);
    assert.equal(JSON.stringify(user).includes("password_hash"), false);
    assert.equal(JSON.stringify(user).includes("super-secret"), false);
  });

  it("does not include the upstream body when the link conflicts", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "taken", subject: "google-subject-1" }, 409);
    };
    await assert.rejects(
      () => linkControlPlaneGoogleUser(config, "ada@example.com", "google-subject-1", { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes("google-subject-1"), false);
        assert.match(cause.message, /conflict \(409\)/);
        return true;
      },
    );
  });
});

describe("console sessions", () => {
  it("stores the bearer call and returns the token once", async () => {
    clearControlPlaneTokenCache();
    const sessionToken = "session-token-value";
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
        token: sessionToken,
        user: {
          id: "55555555-5555-4555-8555-555555555555",
          email: "ada@example.com",
          created_at: "2026-10-18T00:00:00.000Z",
          password_hash: null,
        },
      });
    };

    const opened = await createControlPlaneSession(config, "55555555-5555-4555-8555-555555555555", {
      fetch: fetchImpl,
    });
    assert.equal(authorization, "Bearer issued-bearer");
    assert.match(posted, /55555555-5555-4555-8555-555555555555/);
    assert.equal(opened.token, sessionToken);
    assert.equal(JSON.stringify(opened.user).includes(sessionToken), false);
    assert.equal(JSON.stringify(opened.user).includes("password_hash"), false);

    const reader: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse({ detail: "missing", token: sessionToken }, 404);
    };
    await assert.rejects(
      () => readControlPlaneSession(config, sessionToken, { fetch: reader }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.message.includes(sessionToken), false);
        assert.match(cause.message, /not found \(404\)/);
        return true;
      },
    );

    let revoked = false;
    const revoker: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      revoked = url.endsWith("/api/v1/console-sessions/logout");
      return new Response(null, { status: 204 });
    };
    await revokeControlPlaneSession(config, sessionToken, { fetch: revoker });
    assert.equal(revoked, true);
  });
});
