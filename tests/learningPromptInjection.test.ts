import { describe, expect, it } from "vitest";
import { buildLearningsBlock } from "@/lib/learningPromptInjection";
import type { MetisCouncilLearning } from "@/shared/metis";

function buildLearning(overrides: Partial<MetisCouncilLearning>): MetisCouncilLearning {
  return {
    id: 1,
    sessionId: "session-a",
    kind: "decision",
    statement: "",
    confidence: "firm",
    supportingAgents: [],
    dissent: null,
    rationale: null,
    tags: [],
    supersedesId: null,
    supersededAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildLearningsBlock", () => {
  it("returns an explicit 'none' line when no learnings are retrieved", () => {
    const block = buildLearningsBlock([]);
    expect(block).toContain("None retrieved");
    expect(block).toContain("Do not invent prior outcomes");
  });

  it("groups learnings by kind under readable headers", () => {
    const block = buildLearningsBlock([
      buildLearning({ kind: "decision", statement: "Price AXS Audit at £8k." }),
      buildLearning({ kind: "risk", statement: "Competitor pricing below £5k." }),
      buildLearning({ kind: "principle", statement: "Always validate WCAG automation manually." }),
    ]);

    expect(block).toMatch(/Prior decisions:/);
    expect(block).toMatch(/Principles in force:/);
    expect(block).toMatch(/Known risks:/);
    expect(block.indexOf("Prior decisions:")).toBeLessThan(block.indexOf("Principles in force:"));
    expect(block.indexOf("Principles in force:")).toBeLessThan(block.indexOf("Known risks:"));
  });

  it("tags non-firm decisions so agents can see they are still open", () => {
    const block = buildLearningsBlock([
      buildLearning({
        kind: "decision",
        statement: "Lean toward a federated CAM ID approach.",
        confidence: "provisional",
      }),
    ]);
    expect(block).toContain("[provisional]");
  });

  it("includes surviving dissent when present", () => {
    const block = buildLearningsBlock([
      buildLearning({
        kind: "decision",
        statement: "Price AXS Audit at £8k.",
        dissent: "Enterprise perception risk at this price point.",
      }),
    ]);
    expect(block).toContain("Surviving dissent: Enterprise perception risk");
  });

  it("instructs agents on how to treat firm versus softer learnings", () => {
    const block = buildLearningsBlock([buildLearning({ statement: "Anything." })]);
    expect(block).toMatch(/Treat firm decisions as current truth/);
  });
});
