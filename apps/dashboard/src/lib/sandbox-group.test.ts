import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SEED_PROJECTS } from "@/lib/catalog";
import {
  formatSandboxExpiry,
  groupSandboxesByProject,
  isSandboxExpired,
} from "@/lib/sandbox-group";
import type { Project, Sandbox } from "@/lib/types";

const PROJECT_ALPHA: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "alpha",
  name: "Alpha Service",
  description: null,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
};

const PROJECT_BETA: Project = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "beta",
  name: "Beta Service",
  description: null,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
};

function makeSandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    project_id: PROJECT_ALPHA.id,
    image: "alpine-3.20",
    vcpu: 1,
    memory_mib: 128,
    ttl_seconds: 3600,
    status: "running",
    expires_at: "2026-10-25T15:00:00Z",
    created_at: "2026-10-25T14:00:00Z",
    ...overrides,
  };
}

describe("groupSandboxesByProject", () => {
  it("groups multiple sandboxes across projects in first-appearance order", () => {
    const first = makeSandbox({ id: "33333333-3333-4333-8333-000000000001" });
    const second = makeSandbox({
      id: "33333333-3333-4333-8333-000000000002",
      project_id: PROJECT_BETA.id,
      image: "debian-slim",
    });
    const third = makeSandbox({
      id: "33333333-3333-4333-8333-000000000003",
      project_id: PROJECT_ALPHA.id,
      image: "python-3.12",
    });

    const groups = groupSandboxesByProject(
      [first, second, third],
      [PROJECT_ALPHA, PROJECT_BETA],
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.projectId, PROJECT_ALPHA.id);
    assert.equal(groups[0]?.projectName, "Alpha Service");
    assert.equal(groups[0]?.projectSlug, "alpha");
    assert.deepEqual(
      groups[0]?.sandboxes.map((row) => row.id),
      [first.id, third.id],
    );
    assert.equal(groups[1]?.projectId, PROJECT_BETA.id);
    assert.equal(groups[1]?.projectName, "Beta Service");
    assert.equal(groups[1]?.projectSlug, "beta");
    assert.deepEqual(
      groups[1]?.sandboxes.map((row) => row.id),
      [second.id],
    );
  });

  it("falls back to seed projects or raw project_id when project list is empty", () => {
    const seedRow = makeSandbox({ project_id: SEED_PROJECTS[0].id });
    const unknownRow = makeSandbox({
      id: "33333333-3333-4333-8333-000000000099",
      project_id: "99999999-9999-4999-8999-999999999999",
    });
    const groups = groupSandboxesByProject([seedRow, unknownRow], []);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.projectName, SEED_PROJECTS[0].name);
    assert.equal(groups[0]?.projectSlug, SEED_PROJECTS[0].slug);
    assert.equal(groups[1]?.projectName, "99999999-9999-4999-8999-999999999999");
    assert.equal(groups[1]?.projectSlug, null);
  });
});

describe("formatSandboxExpiry and isSandboxExpired", () => {
  it("formats valid ISO timestamps as UTC and returns raw input when invalid", () => {
    assert.equal(
      formatSandboxExpiry("2026-10-25T15:04:05.000Z"),
      "2026-10-25 15:04:05 UTC",
    );
    assert.equal(formatSandboxExpiry("not-a-timestamp"), "not-a-timestamp");
  });

  it("detects when expires_at has elapsed relative to nowMs", () => {
    const nowMs = Date.parse("2026-10-25T15:00:00Z");
    assert.equal(isSandboxExpired("2026-10-25T14:59:59Z", nowMs), true);
    assert.equal(isSandboxExpired("2026-10-25T15:00:00Z", nowMs), true);
    assert.equal(isSandboxExpired("2026-10-25T15:00:01Z", nowMs), false);
    assert.equal(isSandboxExpired("invalid", nowMs), false);
  });
});
