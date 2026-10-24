import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectDetailPath } from "./project-detail-path";

describe("projectDetailPath", () => {
  it("builds the console project path and optional section hashes", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    assert.equal(projectDetailPath(id), `/projects/${id}`);
    assert.equal(projectDetailPath(id, "environments"), `/projects/${id}#environments`);
    assert.equal(projectDetailPath(id, "routes"), `/projects/${id}#routes`);
  });
});
