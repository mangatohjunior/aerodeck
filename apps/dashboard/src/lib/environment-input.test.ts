import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENVIRONMENT_KIND_INVALID,
  ENVIRONMENT_NAME_INVALID,
  ENVIRONMENT_PROJECT_ID_INVALID,
  ENVIRONMENT_PROJECT_REQUIRED,
  ENVIRONMENT_REGION_INVALID,
  ENVIRONMENT_SLUG_INVALID,
  ENVIRONMENT_UPDATE_EMPTY,
  isValidEnvironmentKind,
  isValidEnvironmentName,
  isValidEnvironmentRegion,
  isValidEnvironmentSlug,
  parseEnvironmentCreateFields,
  parseEnvironmentUpdateFields,
} from "./environment-input";

const VALID_PROJECT_ID = "11111111-1111-4111-8111-111111111111";

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
      projectId: ` ${VALID_PROJECT_ID} `,
      name: "  Production ",
      slug: " Prod ",
      kind: "prod",
      region: "ams3",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.value, {
        projectId: VALID_PROJECT_ID,
        name: "Production",
        slug: "prod",
        kind: "prod",
        region: "ams3",
      });
    }
  });

  it("returns stable codes for each validation failure", () => {
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
        projectId: "not-a-uuid",
        name: "Production",
        slug: "prod",
        kind: "prod",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_PROJECT_ID_INVALID, code: "invalid_project_id" },
    );
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: VALID_PROJECT_ID,
        name: "   ",
        slug: "prod",
        kind: "prod",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_NAME_INVALID, code: "invalid_name" },
    );
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: VALID_PROJECT_ID,
        name: "Production",
        slug: "Prod!",
        kind: "prod",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_SLUG_INVALID, code: "invalid_slug" },
    );
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: VALID_PROJECT_ID,
        name: "Production",
        slug: "prod",
        kind: "qa",
        region: "nyc3",
      }),
      { ok: false, error: ENVIRONMENT_KIND_INVALID, code: "invalid_kind" },
    );
    assert.deepEqual(
      parseEnvironmentCreateFields({
        projectId: VALID_PROJECT_ID,
        name: "Production",
        slug: "prod",
        kind: "prod",
        region: "NYC3",
      }),
      { ok: false, error: ENVIRONMENT_REGION_INVALID, code: "invalid_region" },
    );
  });
});

describe("parseEnvironmentUpdateFields", () => {
  it("accepts a partial update", () => {
    assert.deepEqual(parseEnvironmentUpdateFields({ region: "ams3" }), {
      ok: true,
      value: { region: "ams3" },
    });
  });

  it("rejects an empty update", () => {
    assert.deepEqual(parseEnvironmentUpdateFields({}), {
      ok: false,
      error: ENVIRONMENT_UPDATE_EMPTY,
      code: "empty_update",
    });
  });
});
