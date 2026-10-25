import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchRouteCertificate, issueRouteCertificate } from "./api";
import { jsonRouteControlPlaneError } from "./console-route-path";
import {
  clearControlPlaneTokenCache,
  ControlPlaneError,
  getControlPlaneRouteCertificate,
  issueControlPlaneRouteCertificate,
} from "./control-plane";
import {
  ROUTE_CERTIFICATE_ALREADY_ISSUED,
  ROUTE_CERTIFICATE_ISSUE_FAILED,
  ROUTE_CERTIFICATE_NOT_FOUND,
  ROUTE_CERTIFICATE_UNAVAILABLE,
} from "./route-input";

const config = {
  baseUrl: "https://cp.example",
  clientId: "console",
  clientSecret: "secret-value",
};

const projectId = "11111111-1111-4111-8111-111111111111";
const routeId = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getControlPlaneRouteCertificate and issueControlPlaneRouteCertificate", () => {
  it("reads and issues route certificates with bearer and strips PEM and private keys", async () => {
    clearControlPlaneTokenCache();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      const isIssue = url.endsWith("/certificate/issue");
      return jsonResponse({
        id: "55555555-5555-4555-8555-555555555555",
        route_id: routeId,
        hostname: "Payments.Aero-Deck.App",
        status: isIssue ? "issued" : "pending",
        not_after: isIssue ? "2027-01-23T12:00:00Z" : null,
        certificate_pem: "-----BEGIN CERTIFICATE-----secret",
        private_key_pem: "-----BEGIN PRIVATE KEY-----secret",
        last_error: "dop_v1_secret_token",
      });
    };

    const current = await getControlPlaneRouteCertificate(config, projectId, routeId, {
      fetch: fetchImpl,
    });
    assert.deepEqual(current, {
      route_id: routeId,
      hostname: "payments.aero-deck.app",
      status: "pending",
      not_after: null,
    });
    assert.equal(JSON.stringify(current).includes("PRIVATE KEY"), false);
    assert.equal(JSON.stringify(current).includes("dop_v1_secret_token"), false);

    const issued = await issueControlPlaneRouteCertificate(config, projectId, routeId, {
      fetch: fetchImpl,
    });
    assert.deepEqual(issued, {
      route_id: routeId,
      hostname: "payments.aero-deck.app",
      status: "issued",
      not_after: "2027-01-23T12:00:00Z",
    });
    assert.equal(JSON.stringify(issued).includes("PRIVATE KEY"), false);
    assert.deepEqual(calls, [
      `GET https://cp.example/api/v1/projects/${projectId}/routes/${routeId}/certificate`,
      `POST https://cp.example/api/v1/projects/${projectId}/routes/${routeId}/certificate/issue`,
    ]);
  });

  it("maps ACME/DNS-01 503 and 502 errors without leaking private keys or tokens", async () => {
    clearControlPlaneTokenCache();
    let statusToReturn = 503;
    let codeToReturn = "acme_unavailable";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/token")) {
        return jsonResponse({ access_token: "issued-bearer", expires_in: 900 });
      }
      return jsonResponse(
        { detail: "key -----BEGIN RSA PRIVATE KEY----- failed", code: codeToReturn },
        statusToReturn,
      );
    };

    await assert.rejects(
      () => issueControlPlaneRouteCertificate(config, projectId, routeId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 503);
        assert.equal(cause.code, "certificate_unavailable");
        assert.equal(cause.message.includes("PRIVATE KEY"), false);
        return true;
      },
    );

    statusToReturn = 502;
    codeToReturn = "issuer_failed";
    await assert.rejects(
      () => issueControlPlaneRouteCertificate(config, projectId, routeId, { fetch: fetchImpl }),
      (cause: unknown) => {
        assert.ok(cause instanceof ControlPlaneError);
        assert.equal(cause.status, 502);
        assert.equal(cause.code, "certificate_issue_failed");
        assert.equal(cause.message.includes("PRIVATE KEY"), false);
        return true;
      },
    );
  });
});

describe("certificate BFF error mapping and client helpers", () => {
  it("maps 409, 503 certificate_unavailable, and 502 certificate_issue_failed", async () => {
    const conflict = jsonRouteControlPlaneError(
      new ControlPlaneError("conflict", 409),
      "test_event",
      ROUTE_CERTIFICATE_NOT_FOUND,
      { conflictKind: "certificate" },
    );
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      detail: ROUTE_CERTIFICATE_ALREADY_ISSUED,
      code: "certificate_already_issued",
    });

    const unavailable = jsonRouteControlPlaneError(
      new ControlPlaneError("unavailable", 503, undefined, { code: "certificate_unavailable" }),
      "test_event",
      ROUTE_CERTIFICATE_NOT_FOUND,
      { conflictKind: "certificate" },
    );
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      detail: ROUTE_CERTIFICATE_UNAVAILABLE,
      code: "certificate_unavailable",
    });

    const failed = jsonRouteControlPlaneError(
      new ControlPlaneError("failed", 502, undefined, { code: "certificate_issue_failed" }),
      "test_event",
      ROUTE_CERTIFICATE_NOT_FOUND,
      { conflictKind: "certificate" },
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), {
      detail: ROUTE_CERTIFICATE_ISSUE_FAILED,
      code: "certificate_issue_failed",
    });
  });

  it("calls same-origin certificate status and issue endpoints", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      return jsonResponse({
        route_id: routeId,
        hostname: "payments.aero-deck.app",
        status: method === "POST" ? "issued" : "pending",
        not_after: method === "POST" ? "2027-01-23T12:00:00Z" : null,
      });
    }) as typeof fetch;

    try {
      const before = await fetchRouteCertificate(projectId, routeId);
      const after = await issueRouteCertificate(projectId, routeId);
      assert.equal(before.status, "pending");
      assert.equal(after.status, "issued");
      assert.deepEqual(calls, [
        `GET /api/console/projects/${projectId}/routes/${routeId}/certificate`,
        `POST /api/console/projects/${projectId}/routes/${routeId}/certificate/issue`,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
