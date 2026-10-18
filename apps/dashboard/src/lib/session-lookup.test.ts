import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ControlPlaneError, type ControlPlaneConfig } from "./control-plane";
import {
  isMissingControlPlaneSession,
  lookupSession,
  shouldRevokeControlPlaneSession,
} from "./session-lookup";

const config: ControlPlaneConfig = {
  baseUrl: "http://127.0.0.1:8000",
  clientId: "console",
  clientSecret: "super-secret",
};

describe("lookupSession", () => {
  const mockUser = { id: "user-1", email: "google.user@aerodeck.dev", created_at: "2026-10-18T00:00:00.000Z" };
  const storedUser = { id: "user-2", email: "ada@example.com", created_at: "2026-10-18T00:00:00.000Z" };

  it("keeps a mock-store cookie when the console client is set", async () => {
    let resolved = false;
    const session = await lookupSession({
      token: "mock-google-token",
      config,
      mockUser,
      resolve: async () => {
        resolved = true;
        return storedUser;
      },
    });
    assert.deepEqual(session, { status: "user", user: mockUser });
    assert.equal(resolved, false);
  });

  it("reads a control-plane cookie when the mock store does not have it", async () => {
    const session = await lookupSession({
      token: "control-plane-token",
      config,
      resolve: async (token) => {
        assert.equal(token, "control-plane-token");
        return storedUser;
      },
    });
    assert.deepEqual(session, { status: "user", user: storedUser });
  });

  it("treats a missing control-plane session as signed out", async () => {
    const session = await lookupSession({
      token: "expired-token",
      config,
      resolve: async () => {
        throw new ControlPlaneError("control plane session was not found (404)");
      },
    });
    assert.deepEqual(session, { status: "anonymous" });
  });

  it("keeps the cookie when the control plane cannot be read", async () => {
    const session = await lookupSession({
      token: "control-plane-token",
      config,
      resolve: async () => {
        throw new ControlPlaneError("control plane session request failed (502)");
      },
    });
    assert.deepEqual(session, { status: "unavailable" });
  });

  it("treats only a not-found resolve as signed out", () => {
    assert.equal(
      isMissingControlPlaneSession(new ControlPlaneError("control plane session was not found (404)")),
      true,
    );
    assert.equal(
      isMissingControlPlaneSession(new ControlPlaneError("control plane session request failed (502)")),
      false,
    );
  });

  it("revokes only a control-plane cookie when the console client is set", () => {
    assert.equal(shouldRevokeControlPlaneSession("mock-google-token", config, mockUser), false);
    assert.equal(shouldRevokeControlPlaneSession("control-plane-token", config, undefined), true);
    assert.equal(shouldRevokeControlPlaneSession("mock-google-token", null, mockUser), false);
    assert.equal(shouldRevokeControlPlaneSession(undefined, config, undefined), false);
  });
});
