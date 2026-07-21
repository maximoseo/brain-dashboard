import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2f%2fevil.example/path",
    "javascript:alert(1)",
    null,
    42,
  ])("rejects unsafe redirect %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it("preserves a same-origin path, query, and fragment", () => {
    expect(safeRedirectPath("/inventory?page=2#current")).toBe("/inventory?page=2#current");
  });
});
