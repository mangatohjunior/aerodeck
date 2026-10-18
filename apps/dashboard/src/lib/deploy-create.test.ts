import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDeployment, errorFromFailedCreate, ProvisionEnqueueFailed } from "./api";
import type { Deployment } from "./types";

describe("errorFromFailedCreate", () => {
  it("throws ProvisionEnqueueFailed for provision_enqueue_failed", () => {
    const error = errorFromFailedCreate(
      {
        detail: "Deployment was created but provision could not be queued.",
        code: "provision_enqueue_failed",
        deployment_id: "33333333-3333-4333-8333-333333333333",
      },
      503,
    );
    assert.ok(error instanceof ProvisionEnqueueFailed);
    assert.equal(error.deploymentId, "33333333-3333-4333-8333-333333333333");
    assert.match(error.message, /could not be queued/);
  });

  it("does not treat a random error with deployment_id as enqueue failure", () => {
    const error = errorFromFailedCreate(
      {
        detail: "Control plane request failed.",
        code: "control_plane_unavailable",
        deployment_id: "33333333-3333-4333-8333-333333333333",
      },
      502,
    );
    assert.equal(error instanceof ProvisionEnqueueFailed, false);
    assert.equal(error.message, "Control plane request failed.");
  });
});

describe("createDeployment", () => {
  it("requires target when controlPlane is true", async () => {
    const create = createDeployment as (
      repoUrl: string,
      controlPlane?: boolean,
      target?: { projectId: string; environmentId: string },
    ) => Promise<Deployment>;

    await assert.rejects(
      () => create("https://github.com/acme/payments", true),
      (cause: unknown) => {
        assert.ok(cause instanceof Error);
        assert.match(cause.message, /Select an environment/);
        return true;
      },
    );
  });
});
