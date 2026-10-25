import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProjectRoute, fetchRouteDns } from "./api";
import { jsonRouteControlPlaneError } from "./console-route-path";
import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  createControlPlaneRoute,
  getControlPlaneRouteDns,
} from "./control-plane";
import {
  ROUTE_DNS_FAILED,
  ROUTE_DNS_NOT_FOUND,
  ROUTE_DNS_UNAVAILABLE,
  ROUTE_HOSTNAME_TAKEN,
} from "./route-input";

const config = {
  baseUrl: "https://cp.example",
  clientId: "console",
  clientSecret: "secret-value",
};

const projectId = "11111111-1111-4111-8111-111111111111";
const environmentId = "22222222-2222-4222-8222-222222222222";
const routeId = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createControlPlaneRoute", () => {
  it("posts route creation with bearer and strips backend_host and secrets", async () => {
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
      assert.ok(url.endsWith(`/api/v1/projects/${projectId}/routes`));
      return jsonResponse(
        {
          id: routeId,
          project_id: projectId,
          environment_id: environmentId,
          hostname: "Payments.Aero-Deck.App",
          path_prefix: "/",
          backend_host: "10.10.1.20",
          backend_port: 8080,
          entrypoint: "web",
          enabled: true,
          secret_token: "do-not-expose",
        },
        201,
      );
    };

    const route = await createControlPlaneRoute(
      config,
      {
        projectId,
        environmentId,
        hostname: "payments.aero-deck.app",
        backendHost: "10.10.1.20",
        backendPort: 8080,
        pathPrefix: "/",
      },
      { fetch: fetchImpl },
    );

    assert.equal(method, "POST");
    assert.equal(authorization, "Bearer issued-bearer");
    assert.deepEqual(posted, {
      environment_id: environmentId,
      hostname: "payments.aero-deck.app",
      path_prefix: "/",
      backend_host: "10.10.1.20",
      backend_port: 8080,
    });
    assert.deepEqual(route, {
      id: routeId,
      project_id: projectId,
      environment_id: environmentId,
      hostname: "payments.aero-deck.app",
      enabled: true,
    });
    assert.equal(JSON.stringify(route).includes("10.10.1.20"), false);
    assert.equal(JSON.stringify(route).includes("do-not-expose"), false);
  });

  it("maps DigitalOcean DNS 503 and 502 errors without leaking upstream details", async () => {
    clearControlPlaneTokenCache();
    let statusToReturn = 503;
    let codeToReturn = "dns_record_unavailable";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse(
        { detail: "DO token dop_v1_secret failed", code: codeToReturn },
        statusToReturn,
      );
    };

    await assert.rejects(
      () =>
        createControlPlaneRoute(
          config,
          {
            projectId,
            environmentId,
            hostname: "payments.aero-deck.app",
            backendHost: "10.10.1.20",
            backendPort: 8080,
            pathPrefix: "/",
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.code, "dns_record_unavailable");
        assert.equal(cause.message.includes("dop_v1_secret"), false);
        return true;
      },
    );

    statusToReturn = 502;
    codeToReturn = "dns_record_failed";
    await assert.rejects(
      () =>
        createControlPlaneRoute(
          config,
          {
            projectId,
            environmentId,
            hostname: "payments.aero-deck.app",
            backendHost: "10.10.1.20",
            backendPort: 8080,
            pathPrefix: "/",
          },
          { fetch: fetchImpl },
        ),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 502);
        assert.equal(cause.code, "dns_record_failed");
        assert.equal(cause.message.includes("dop_v1_secret"), false);
        return true;
      },
    );
  });
});

describe("getControlPlaneRouteDns", () => {
  it("reads the route DNS record with bearer and strips extra fields", async () => {
    clearControlPlaneTokenCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      assert.ok(url.endsWith(`/api/v1/projects/${projectId}/routes/${routeId}/dns`));
      return jsonResponse({
        id: "44444444-4444-4444-8444-444444444444",
        route_id: routeId,
        hostname: "Payments.Aero-Deck.App",
        record_type: "CNAME",
        data: "edge.aero-deck.app.",
        ttl: 300,
        status: "published",
        provider_token: "dop_v1_secret",
      });
    };

    const record = await getControlPlaneRouteDns(config, projectId, routeId, {
      fetch: fetchImpl,
    });
    assert.deepEqual(record, {
      route_id: routeId,
      hostname: "payments.aero-deck.app",
      record_type: "CNAME",
      data: "edge.aero-deck.app.",
      ttl: 300,
      status: "published",
    });
    assert.equal(JSON.stringify(record).includes("dop_v1_secret"), false);
  });
});

describe("jsonRouteControlPlaneError", () => {
  it("maps 409, 503 dns_record_unavailable, and 502 dns_record_failed to clear operator messages", async () => {
    const conflict = jsonRouteControlPlaneError(
      new ControlPlaneError("conflict", 409),
      "test_event",
      ROUTE_DNS_NOT_FOUND,
    );
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      detail: ROUTE_HOSTNAME_TAKEN,
      code: "hostname_taken",
    });

    const unavailable = jsonRouteControlPlaneError(
      new ControlPlaneError("unavailable", 503, undefined, { code: "dns_record_unavailable" }),
      "test_event",
      ROUTE_DNS_NOT_FOUND,
    );
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      detail: ROUTE_DNS_UNAVAILABLE,
      code: "dns_unavailable",
    });

    const failed = jsonRouteControlPlaneError(
      new ControlPlaneError("failed", 502, undefined, { code: "dns_record_failed" }),
      "test_event",
      ROUTE_DNS_NOT_FOUND,
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), {
      detail: ROUTE_DNS_FAILED,
      code: "dns_record_failed",
    });
  });
});

describe("createProjectRoute and fetchRouteDns client helpers", () => {
  it("calls same-origin console route and DNS endpoints", async () => {
    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      urls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/dns")) {
        return jsonResponse({
          route_id: routeId,
          hostname: "payments.aero-deck.app",
          record_type: "CNAME",
          data: "edge.aero-deck.app.",
          ttl: 300,
          status: "published",
        });
      }
      return jsonResponse(
        {
          id: routeId,
          project_id: projectId,
          environment_id: environmentId,
          hostname: "payments.aero-deck.app",
          enabled: true,
        },
        201,
      );
    }) as typeof fetch;

    try {
      const created = await createProjectRoute({
        projectId,
        environmentId,
        hostname: "payments.aero-deck.app",
        backendHost: "10.10.1.20",
        backendPort: 8080,
        pathPrefix: "/",
      });
      const dns = await fetchRouteDns(projectId, routeId);
      assert.equal(created.hostname, "payments.aero-deck.app");
      assert.equal(dns.data, "edge.aero-deck.app.");
      assert.deepEqual(urls, [
        `POST /api/console/projects/${projectId}/routes`,
        `GET /api/console/projects/${projectId}/routes/${routeId}/dns`,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

