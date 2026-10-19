import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteEnvironment, updateEnvironment } from "./api";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT_ID = "22222222-2222-4222-8222-222222222222";
const ENV_PATH = `/api/console/projects/${PROJECT_ID}/environments/${ENVIRONMENT_ID}`;

describe("updateEnvironment", () => {
  it("patches fields to /api/console/projects/{id}/environments/{environmentId}", async () => {
    let method = "";
    let url = "";
    let posted: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      method = init?.method ?? "GET";
      url = String(input);
      posted = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: ENVIRONMENT_ID,
          project_id: PROJECT_ID,
          project_slug: "payments",
          project_name: "Payments",
          slug: "prod",
          name: "Production EU",
          kind: "prod",
          region: "fra1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const environment = await updateEnvironment(PROJECT_ID, ENVIRONMENT_ID, {
        name: "Production EU",
        kind: "prod",
        region: "fra1",
      });
      assert.equal(method, "PATCH");
      assert.equal(url, ENV_PATH);
      assert.deepEqual(posted, {
        name: "Production EU",
        kind: "prod",
        region: "fra1",
      });
      assert.equal(environment.name, "Production EU");
      assert.equal(environment.region, "fra1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          detail: "Environment fields failed validation.",
          code: "invalid",
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    try {
      await assert.rejects(
        () => updateEnvironment(PROJECT_ID, ENVIRONMENT_ID, { name: "x" }),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "Environment fields failed validation.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("deleteEnvironment", () => {
  it("deletes via /api/console/projects/{id}/environments/{environmentId}", async () => {
    let method = "";
    let url = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      method = init?.method ?? "GET";
      url = String(input);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await deleteEnvironment(PROJECT_ID, ENVIRONMENT_ID);
      assert.equal(method, "DELETE");
      assert.equal(url, ENV_PATH);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "Environment not found.", code: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => deleteEnvironment(PROJECT_ID, ENVIRONMENT_ID),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "Environment not found.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
