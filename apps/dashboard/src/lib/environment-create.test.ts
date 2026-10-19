import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEnvironment } from "./api";

describe("createEnvironment", () => {
  it("posts project_id and fields to /api/console/environments", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
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
          id: "22222222-2222-4222-8222-222222222222",
          project_id: projectId,
          project_slug: "payments",
          project_name: "Payments",
          slug: "prod",
          name: "Production",
          kind: "prod",
          region: "ams3",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const environment = await createEnvironment({
        projectId,
        slug: "prod",
        name: "Production",
        kind: "prod",
        region: "ams3",
      });
      assert.equal(method, "POST");
      assert.equal(url, "/api/console/environments");
      assert.deepEqual(posted, {
        project_id: projectId,
        slug: "prod",
        name: "Production",
        kind: "prod",
        region: "ams3",
      });
      assert.equal(environment.slug, "prod");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          detail: "That slug is already taken in this project.",
          code: "slug_taken",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          createEnvironment({
            projectId: "11111111-1111-4111-8111-111111111111",
            slug: "prod",
            name: "Production",
            kind: "prod",
          }),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "That slug is already taken in this project.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
