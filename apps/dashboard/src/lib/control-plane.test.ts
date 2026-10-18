import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  listControlPlaneProjects,
  readControlPlaneConfig,
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
