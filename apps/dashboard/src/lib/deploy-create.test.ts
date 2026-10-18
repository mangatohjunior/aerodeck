import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProvisionEnqueueFailed, shouldOpenDeploymentAfterCreate } from "./api";

describe("shouldOpenDeploymentAfterCreate", () => {
  it("opens the deployment page after a successful create", () => {
    assert.equal(
      shouldOpenDeploymentAfterCreate({
        id: "33333333-3333-4333-8333-333333333333",
      }),
      true,
    );
  });

  it("does not open the deployment page when provision enqueue failed", () => {
    const failure = new ProvisionEnqueueFailed(
      "Deployment was created but provision could not be queued.",
      "33333333-3333-4333-8333-333333333333",
    );
    assert.equal(shouldOpenDeploymentAfterCreate(failure), false);
  });
});
