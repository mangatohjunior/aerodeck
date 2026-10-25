import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nativeSelectClassName } from "@/lib/native-select";

describe("nativeSelectClassName", () => {
  it("includes dark surface, foreground, color-scheme, and option popup classes", () => {
    const className = nativeSelectClassName();
    assert.ok(className.includes("bg-card"));
    assert.ok(className.includes("text-foreground"));
    assert.ok(className.includes("[color-scheme:dark]"));
    assert.ok(className.includes("[&>option]:bg-popover"));
    assert.ok(className.includes("[&>option]:text-popover-foreground"));
  });

  it("merges caller classes", () => {
    const className = nativeSelectClassName("font-mono", false, undefined);
    assert.ok(className.includes("font-mono"));
  });
});
