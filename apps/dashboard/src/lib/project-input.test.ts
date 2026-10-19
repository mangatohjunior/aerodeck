import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidProjectName,
  isValidProjectSlug,
  normalizeProjectDescription,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_SLUG_MAX,
} from "./project-input";

describe("isValidProjectSlug", () => {
  it("accepts lowercase alphanumerics and interior hyphens", () => {
    assert.equal(isValidProjectSlug("payments"), true);
    assert.equal(isValidProjectSlug("a"), true);
    assert.equal(isValidProjectSlug("acme-billing-1"), true);
  });

  it("rejects uppercase, underscores, leading/trailing hyphens, and empties", () => {
    assert.equal(isValidProjectSlug(""), false);
    assert.equal(isValidProjectSlug("Payments"), false);
    assert.equal(isValidProjectSlug("acme_billing"), false);
    assert.equal(isValidProjectSlug("-payments"), false);
    assert.equal(isValidProjectSlug("payments-"), false);
  });

  it("rejects slugs longer than the control-plane max", () => {
    assert.equal(isValidProjectSlug("a".repeat(PROJECT_SLUG_MAX)), true);
    assert.equal(isValidProjectSlug("a".repeat(PROJECT_SLUG_MAX + 1)), false);
  });
});

describe("isValidProjectName", () => {
  it("requires a non-empty trimmed name within the max length", () => {
    assert.equal(isValidProjectName("Payments"), true);
    assert.equal(isValidProjectName("  Payments  "), true);
    assert.equal(isValidProjectName("   "), false);
    assert.equal(isValidProjectName("x".repeat(PROJECT_NAME_MAX)), true);
    assert.equal(isValidProjectName("x".repeat(PROJECT_NAME_MAX + 1)), false);
  });
});

describe("normalizeProjectDescription", () => {
  it("trims and maps blank to null", () => {
    assert.equal(normalizeProjectDescription(undefined), null);
    assert.equal(normalizeProjectDescription(null), null);
    assert.equal(normalizeProjectDescription("  "), null);
    assert.equal(normalizeProjectDescription("  hello  "), "hello");
    assert.equal(
      normalizeProjectDescription("x".repeat(PROJECT_DESCRIPTION_MAX))?.length,
      PROJECT_DESCRIPTION_MAX,
    );
  });
});
