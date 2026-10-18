import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDeployment,
  errorFromFailedCreate,
  isProvisionFailureLogLine,
  PROVISION_FAILED_LINE_PREFIX,
  PROVISION_QUEUE_FAILED_LINE,
  ProvisionEnqueueFailed,
} from "./api";
import { PROVISION_ENQUEUE_FAILED, type Deployment } from "./types";

describe("errorFromFailedCreate", () => {
  it("throws ProvisionEnqueueFailed for provision_enqueue_failed", () => {
    const error = errorFromFailedCreate(
      {
        detail: "Deployment was created but provision could not be queued.",
        code: PROVISION_ENQUEUE_FAILED,
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

describe("isProvisionFailureLogLine", () => {
  it("matches queue and worker failure lines", () => {
    assert.equal(isProvisionFailureLogLine(PROVISION_QUEUE_FAILED_LINE), true);
    assert.equal(
      isProvisionFailureLogLine(`${PROVISION_FAILED_LINE_PREFIX} PermanentJobError`),
      true,
    );
    assert.equal(isProvisionFailureLogLine("Done"), false);
    assert.equal(isProvisionFailureLogLine("Queued environment provision..."), false);
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

  it("posts project_id and environment_id for control-plane create", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const environmentId = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "33333333-3333-4333-8333-333333333333";
    let posted: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: deploymentId,
          repo_url: "https://github.com/acme/payments",
          owner: "acme",
          repo: "payments",
          status: "running",
          started_at: "2026-10-18T00:00:00.000Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const deployment = await createDeployment("https://github.com/acme/payments", true, {
        projectId,
        environmentId,
      });
      assert.equal(deployment.id, deploymentId);
      assert.deepEqual(posted, {
        repo_url: "https://github.com/acme/payments",
        project_id: projectId,
        environment_id: environmentId,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
