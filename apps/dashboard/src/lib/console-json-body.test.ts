import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readJsonObject,
  readOptionalNullableString,
  readOptionalString,
} from "./console-json-body";

describe("readJsonObject", () => {
  it("accepts a plain object body", async () => {
    const result = await readJsonObject(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ name: "Payments" }),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, { name: "Payments" });
    }
  });

  it("rejects null and array bodies", async () => {
    for (const body of ["null", "[]"]) {
      const result = await readJsonObject(
        new Request("http://localhost", { method: "PATCH", body }),
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.response.status, 400);
      }
    }
  });
});

describe("readOptionalString", () => {
  it("omits missing keys and rejects non-strings", () => {
    assert.deepEqual(readOptionalString({}, "name", "invalid_name"), { ok: true });
    assert.deepEqual(readOptionalString({ name: "Prod" }, "name", "invalid_name"), {
      ok: true,
      value: "Prod",
    });
    const bad = readOptionalString({ name: 1 }, "name", "invalid_name");
    assert.equal(bad.ok, false);
  });
});

describe("readOptionalNullableString", () => {
  it("allows null", () => {
    assert.deepEqual(readOptionalNullableString({ description: null }, "description", "invalid_description"), {
      ok: true,
      value: null,
    });
  });
});
