import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROVISION_FAILED_LINE_PREFIX,
  PROVISION_QUEUE_FAILED_LINE,
} from "./api";

const here = dirname(fileURLToPath(import.meta.url));
const deploymentLogsPy = join(
  here,
  "../../../control-plane/app/services/deployment_logs.py",
);

describe("provision log line contract", () => {
  it("matches control-plane deployment_logs constants", () => {
    const source = readFileSync(deploymentLogsPy, "utf8");
    assert.match(
      source,
      new RegExp(
        `PROVISION_QUEUE_FAILED_LINE = "${PROVISION_QUEUE_FAILED_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );
    assert.match(
      source,
      /return f"Provision failed: \{type\(exc\)\.__name__\}"/,
    );
    assert.equal(PROVISION_FAILED_LINE_PREFIX, "Provision failed:");
  });
});
