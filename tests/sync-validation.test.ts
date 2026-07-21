import { describe, expect, it } from "vitest";
import { syncBodySchema } from "@/app/api/sync/route";

describe("sync payload validation", () => {
  it("accepts a valid complete snapshot", () => {
    const result = syncBodySchema.safeParse({ bot: "agent-1", assets: [{ type: "skill", name: "Research skill" }] });
    expect(result.success).toBe(true);
  });

  it("rejects unknown asset enums instead of silently skipping them", () => {
    const result = syncBodySchema.safeParse({ bot: "agent-1", assets: [{ type: "unknown", name: "Invalid asset" }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.join(".") === "assets.0.type")).toBe(true);
  });

  it("returns all independently invalid rows", () => {
    const result = syncBodySchema.safeParse({
      bot: "agent-1",
      assets: [
        { type: "unknown", name: "Invalid asset" },
        { type: "skill", name: "x", owner: "another-agent" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
  });
});
