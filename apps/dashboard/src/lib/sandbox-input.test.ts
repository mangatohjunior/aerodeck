import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeSandboxesById,
  parseSandboxCreateFields,
  SANDBOX_IMAGE_INVALID,
  SANDBOX_MEMORY_INVALID,
  SANDBOX_PROJECT_REQUIRED,
  SANDBOX_TTL_INVALID,
  SANDBOX_VCPU_INVALID,
} from "./sandbox-input";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("parseSandboxCreateFields", () => {
  it("normalizes image and applies defaults when optional resource fields are omitted", () => {
    const parsed = parseSandboxCreateFields({
      projectId,
      image: " Alpine-3.20 ",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.value, {
        projectId,
        image: "alpine-3.20",
        vcpu: 1,
        memoryMib: 128,
        ttlSeconds: 3600,
      });
    }
  });

  it("rejects missing project, path-separator image, and out-of-range vcpu/memory/ttl", () => {
    assert.deepEqual(
      parseSandboxCreateFields({ projectId: " ", image: "alpine-3.20" }),
      { ok: false, error: SANDBOX_PROJECT_REQUIRED, code: "missing_project" },
    );

    assert.deepEqual(
      parseSandboxCreateFields({ projectId, image: "../alpine-3.20" }),
      { ok: false, error: SANDBOX_IMAGE_INVALID, code: "invalid_image" },
    );

    assert.deepEqual(
      parseSandboxCreateFields({ projectId, image: "alpine-3.20", vcpu: "9" }),
      { ok: false, error: SANDBOX_VCPU_INVALID, code: "invalid_vcpu" },
    );

    assert.deepEqual(
      parseSandboxCreateFields({ projectId, image: "alpine-3.20", memoryMib: "16" }),
      { ok: false, error: SANDBOX_MEMORY_INVALID, code: "invalid_memory_mib" },
    );

    assert.deepEqual(
      parseSandboxCreateFields({ projectId, image: "alpine-3.20", ttlSeconds: "10" }),
      { ok: false, error: SANDBOX_TTL_INVALID, code: "invalid_ttl_seconds" },
    );
  });
});

describe("mergeSandboxesById", () => {
  it("prepends newly created sandboxes without duplicates", () => {
    const first = {
      id: "22222222-2222-4222-8222-222222222222",
      project_id: projectId,
      image: "alpine-3.20",
      vcpu: 1,
      memory_mib: 128,
      ttl_seconds: 3600,
      status: "running" as const,
      expires_at: "2026-10-25T14:00:00Z",
      created_at: "2026-10-25T13:00:00Z",
    };
    const second = {
      ...first,
      id: "33333333-3333-4333-8333-333333333333",
      image: "debian-12",
    };
    const merged = mergeSandboxesById([second], [first, second]);
    assert.deepEqual(
      merged.map((row) => row.image),
      ["debian-12", "alpine-3.20"],
    );
  });
});
