import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteProject, updateProject } from "./api";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("updateProject", () => {
  it("patches name and description to /api/console/projects/{id}", async () => {
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
          id: PROJECT_ID,
          slug: "payments",
          name: "Payments v2",
          description: "Updated rails",
          created_at: "2026-10-19T00:00:00.000Z",
          updated_at: "2026-10-19T01:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const project = await updateProject(PROJECT_ID, {
        name: "Payments v2",
        description: "Updated rails",
      });
      assert.equal(method, "PATCH");
      assert.equal(url, `/api/console/projects/${PROJECT_ID}`);
      assert.deepEqual(posted, {
        name: "Payments v2",
        description: "Updated rails",
      });
      assert.equal(project.name, "Payments v2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "Project fields failed validation.", code: "invalid" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => updateProject(PROJECT_ID, { name: "x" }),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "Project fields failed validation.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("deleteProject", () => {
  it("deletes via /api/console/projects/{id}", async () => {
    let method = "";
    let url = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      method = init?.method ?? "GET";
      url = String(input);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await deleteProject(PROJECT_ID);
      assert.equal(method, "DELETE");
      assert.equal(url, `/api/console/projects/${PROJECT_ID}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps error detail from a non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "Project not found.", code: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => deleteProject(PROJECT_ID),
        (cause: unknown) => {
          assert.ok(cause instanceof Error);
          assert.equal(cause.message, "Project not found.");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
