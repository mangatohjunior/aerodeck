import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENVIRONMENT_NAME_INVALID,
  ENVIRONMENT_PROJECT_REQUIRED,
  isValidEnvironmentKind,
  isValidEnvironmentName,
  isValidEnvironmentRegion,
  isValidEnvironmentSlug,
  parseEnvironmentCreateFields,
} from "./environment-input";

describe("isValidEnvironmentSlug", () => {
  it("matches project slug rules", () => {
    assert.equal(isValidEnvironmentSlug("dev"), true);
    assert.equal(isValidEnvironmentSlug("staging-1"), true);
    assert.equal(isValidEnvironmentSlug("Dev"), false);
  });
});

describe("isValidEnvironmentName", () => {
  it("requires a non-empty trimmed name", () => {
    assert.equal(isValidEnvironmentName("Dev"), true);
    assert.equal(isValidEnvironmentName("   "), false);
  });
});

describe("isValidEnvironmentKind", () => {
  it("allows only control-plane kinds", () => {
    assert.equal(isValidEnvironmentKind("dev"), true);
    assert.equal(isValidEnvironmentKind("staging"), true);
    assert.equal(isValidEnvironmentKind("prod"), true);
    assert.equal(isValidEnvironmentKind("qa"), false);
  });
});

describe("isValidEnvironmentRegion", () => {
  it("matches the DigitalOcean slug pattern", () => {
    assert.equal(isValidEnvironmentRegion("nyc3"), true);
    assert.equal(isValidEnvironmentRegion("ams3"), true);
    assert.equal(isValidEnvironmentRegion("fra1"), true);
    assert.equal(isValidEnvironmentRegion("nyc"), false);
    assert.equal(isValidEnvironmentRegion("NYC3"), false);
    assert.equal(isValidEnvironmentRegion("amsterdam"), false);
  });
});

describe("parseEnvironmentCreateFields", () => {
  it("returns trimmed fields when valid", () => {
    const parsed = parseEnvironmentCreateFields({
      projectId: " 11111111-1111-4111-8111-111111111111 ",
      name: "  Production ",
      slug: " Prod ",
      kind: "prod",
      region: "ams3",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.value, {
        projectId: "11111111-1111-4111-8111-111111111111",
        name: "Production",
        slug: "prod",
        kind: "prod",
        region: "ams3",
      });
    }
  });

  it("returns the first validation error with a stable code", () => {
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: "",
        name: "Production",
        slug: "prod",
        kind: "prod",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_PROJECT_REQUIRED, code: "missing_project" },
    );
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: "11111111-1111-4111-8111-111111111111",
        name: "   ",
        slug: "prod",
        kind: "prod",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_NAME_INVALID, code: "invalid_name" },
    );
  });
});
