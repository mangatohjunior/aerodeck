import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deploymentEnvironmentLabel } from "./deployment-environment-label";
import type { EnvironmentOption } from "./types";

const environments: EnvironmentOption[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    project_id: "11111111-1111-4111-8111-111111111111",
    project_slug: "payments",
    project_name: "Payments",
    slug: "prod",
    name: "Prod",
    kind: "prod",
    region: "ams3",
  },
];

describe("deploymentEnvironmentLabel", () => {
  it("returns project_slug/environment_slug for a catalog match", () => {
    assert.equal(
      deploymentEnvironmentLabel(
        {
          project_id: "11111111-1111-4111-8111-111111111111",
          environment_id: "22222222-2222-4222-8222-222222222222",
        },
        environments,
      ),
      "payments/prod",
    );
  });

  it("returns null when unlinked or unmatched", () => {
    assert.equal(deploymentEnvironmentLabel({}, environments), null);
    assert.equal(
      deploymentEnvironmentLabel(
        {
          project_id: "11111111-1111-4111-8111-111111111111",
          environment_id: "33333333-3333-4333-8333-333333333333",
        },
        environments,
      ),
      null,
    );
  });
});
