import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { environmentsForProject, mergeEnvironmentsById } from "./environment-list";
import type { EnvironmentOption } from "./types";

function env(partial: Partial<EnvironmentOption> & Pick<EnvironmentOption, "id" | "project_id">): EnvironmentOption {
  return {
    slug: "prod",
    name: "Production",
    project_slug: "payments",
    project_name: "Payments",
    kind: "prod",
    region: "nyc3",
    ...partial,
  };
}

describe("mergeEnvironmentsById", () => {
  it("keeps the first occurrence and appends new ids", () => {
    const existing = env({ id: "a", project_id: "p1", slug: "prod" });
    const created = env({ id: "b", project_id: "p1", slug: "dev" });
    const duplicate = env({ id: "a", project_id: "p1", slug: "prod-renamed" });
    assert.deepEqual(mergeEnvironmentsById([created], [existing, duplicate]), [
      created,
      existing,
    ]);
  });
});

describe("environmentsForProject", () => {
  it("filters by project_id", () => {
    const rows = [
      env({ id: "a", project_id: "p1" }),
      env({ id: "b", project_id: "p2" }),
    ];
    assert.deepEqual(environmentsForProject(rows, "p1").map((row) => row.id), ["a"]);
  });
});
