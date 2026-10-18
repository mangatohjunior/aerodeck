import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { environmentOptionKey } from "./environment-option";

describe("environmentOptionKey", () => {
  it("joins project_id and environment id", () => {
    assert.equal(
      environmentOptionKey({
        project_id: "11111111-1111-4111-8111-111111111111",
        id: "22222222-2222-4222-8222-222222222222",
      }),
      "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    );
  });
});
