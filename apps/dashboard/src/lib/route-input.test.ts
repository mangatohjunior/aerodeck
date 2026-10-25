import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDnsGuidance,
  formatDnsTarget,
  mergeRoutesById,
  parseRouteCreateFields,
  ROUTE_BACKEND_HOST_INVALID,
  ROUTE_BACKEND_PORT_INVALID,
  ROUTE_ENVIRONMENT_REQUIRED,
  ROUTE_HOSTNAME_INVALID,
  ROUTE_PATH_PREFIX_INVALID,
} from "./route-input";

const projectId = "11111111-1111-4111-8111-111111111111";
const environmentId = "22222222-2222-4222-8222-222222222222";

describe("parseRouteCreateFields", () => {
  it("normalizes hostname and path_prefix for valid route input", () => {
    const parsed = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "  Payments.Aero-Deck.App ",
      backendHost: " 10.10.1.20 ",
      backendPort: "8080",
      pathPrefix: "/api/v1/",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.value, {
        projectId,
        environmentId,
        hostname: "payments.aero-deck.app",
        backendHost: "10.10.1.20",
        backendPort: 8080,
        pathPrefix: "/api/v1",
      });
    }
  });

  it("defaults pathPrefix to / when omitted", () => {
    const parsed = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "payments.aero-deck.app",
      backendHost: "app-service",
      backendPort: 3000,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.pathPrefix, "/");
      assert.equal(parsed.value.backendPort, 3000);
    }
  });

  it("rejects missing environment, single-label hostname, bad backend host, port, and path", () => {
    const missingEnv = parseRouteCreateFields({
      projectId,
      environmentId: " ",
      hostname: "payments.aero-deck.app",
      backendHost: "10.10.1.20",
      backendPort: 8080,
    });
    assert.deepEqual(missingEnv, {
      ok: false,
      error: ROUTE_ENVIRONMENT_REQUIRED,
      code: "missing_environment",
    });

    const singleLabel = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "localhost",
      backendHost: "10.10.1.20",
      backendPort: 8080,
    });
    assert.deepEqual(singleLabel, {
      ok: false,
      error: ROUTE_HOSTNAME_INVALID,
      code: "invalid_hostname",
    });

    const badHost = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "payments.aero-deck.app",
      backendHost: "http://10.10.1.20",
      backendPort: 8080,
    });
    assert.deepEqual(badHost, {
      ok: false,
      error: ROUTE_BACKEND_HOST_INVALID,
      code: "invalid_backend_host",
    });

    const badPort = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "payments.aero-deck.app",
      backendHost: "10.10.1.20",
      backendPort: "70000",
    });
    assert.deepEqual(badPort, {
      ok: false,
      error: ROUTE_BACKEND_PORT_INVALID,
      code: "invalid_backend_port",
    });

    const badPath = parseRouteCreateFields({
      projectId,
      environmentId,
      hostname: "payments.aero-deck.app",
      backendHost: "10.10.1.20",
      backendPort: 8080,
      pathPrefix: "api",
    });
    assert.deepEqual(badPath, {
      ok: false,
      error: ROUTE_PATH_PREFIX_INVALID,
      code: "invalid_path_prefix",
    });
  });
});

describe("mergeRoutesById and DNS formatting", () => {
  it("prepends newly created routes without duplicates", () => {
    const first = {
      id: "33333333-3333-4333-8333-333333333333",
      project_id: projectId,
      environment_id: environmentId,
      hostname: "payments.aero-deck.app",
      enabled: true,
    };
    const second = {
      id: "44444444-4444-4444-8444-444444444444",
      project_id: projectId,
      environment_id: environmentId,
      hostname: "billing.aero-deck.app",
      enabled: true,
    };
    const merged = mergeRoutesById([second], [first, second]);
    assert.deepEqual(
      merged.map((row) => row.hostname),
      ["billing.aero-deck.app", "payments.aero-deck.app"],
    );
  });

  it("formats DigitalOcean CNAME targets without trailing dot", () => {
    assert.equal(formatDnsTarget("edge.aero-deck.app."), "edge.aero-deck.app");
    assert.equal(
      formatDnsGuidance({
        route_id: "33333333-3333-4333-8333-333333333333",
        hostname: "payments.aero-deck.app",
        record_type: "CNAME",
        data: "edge.aero-deck.app.",
        ttl: 300,
        status: "published",
      }),
      "CNAME payments.aero-deck.app → edge.aero-deck.app (TTL 300s)",
    );
  });
});

