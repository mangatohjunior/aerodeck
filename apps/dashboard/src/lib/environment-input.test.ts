import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidEnvironmentKind,
  isValidEnvironmentName,
  isValidEnvironmentRegion,
  isValidEnvironmentSlug,
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
