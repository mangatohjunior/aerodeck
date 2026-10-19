import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProject } from "./api";

describe("createProject", () => {
  it("posts slug, name, and description to /api/console/projects", async () => {
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
          id: "11111111-1111-4111-8111-111111111111",
          slug: "payments",
          name: "Payments",
          description: "Card rails",
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const project = await createProject({
        slug: "payments",
        name: "Payments",
        description: "Card rails",
      });
      assert.equal(method, "POST");
      assert.equal(url, "/api/console/projects");
      assert.deepEqual(posted, {
        slug: "payments",
        name: "Payments",
        description: "Card rails",
      });
      assert.equal(project.slug, "payments");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("omits a blank description from the JSON body", async () => {
    let posted: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          slug: "billing",
          name: "Billing",
          description: null,
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T00:00:00.000Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      await createProject({ slug: "billing", name: "Billing", description: null });
      assert.deepEqual(posted, { slug: "billing", name: "Billing" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "That slug is already taken.", code: "slug_taken" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => createProject({ slug: "payments", name: "Payments" }),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "That slug is already taken.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
