import { describe, expect, it } from "vitest";
import {
  truncateContentForTest,
  enforceCompactPayloadForTest,
  formatStructuredContentForTest,
} from "@/lib/metisCouncil";

describe("truncateContent (free-form content truncator)", () => {
  it("returns text untouched when under the word limit", () => {
    const input = "This is a short paragraph.\n\nWith two paragraphs and a line break.";
    const result = truncateContentForTest(input, 50);
    expect(result).toBe(input);
  });

  it("preserves newlines and bullet formatting inside the budget", () => {
    const input = "Opening sentence.\n\nFollowed by:\n- bullet one\n- bullet two\n\nClosing thought.";
    const result = truncateContentForTest(input, 50);
    expect(result).toContain("\n- bullet one");
    expect(result).toContain("\n\nClosing thought.");
  });

  it("truncates with an ellipsis when over the word limit", () => {
    const longText = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const result = truncateContentForTest(longText, 50);
    expect(result.endsWith("…")).toBe(true);
    // Should have roughly 50 words before the ellipsis.
    const wordCount = result.replace(/…$/, "").trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(51);
  });

  it("returns a fallback when content is empty or whitespace only", () => {
    expect(truncateContentForTest("", 50)).toBe("No content returned.");
    expect(truncateContentForTest("   \n   \n", 50)).toBe("No content returned.");
  });

  it("does not re-shape content that has no structural markers", () => {
    const prose = "This is a single paragraph of prose with no bullets, no headers, nothing structural. It just says what it says.";
    const result = truncateContentForTest(prose, 100);
    expect(result).toBe(prose);
  });
});

describe("enforceCompactPayload (free-form version)", () => {
  it("preserves content as-is when under the word budget", () => {
    const input = {
      content: "A naturally written paragraph that does not need restructuring.",
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: "We proceed because the brief is clear.",
    };
    const result = enforceCompactPayloadForTest(input, false);
    expect(result.content).toBe(input.content);
    expect(result.summaryRationale).toBe(input.summaryRationale);
  });

  it("truncates summaryRationale separately from content", () => {
    const input = {
      content: "Short content.",
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: Array.from({ length: 100 }, () => "word").join(" "),
    };
    const result = enforceCompactPayloadForTest(input, false);
    expect(result.summaryRationale?.endsWith("…")).toBe(true);
  });

  it("uses a larger content budget for synthesis than for discussion", () => {
    const input = {
      content: Array.from({ length: 160 }, (_, i) => `w${i}`).join(" "),
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: "Short.",
    };
    // Discussion budget truncates at 140 words (so 160-word input is cut).
    const discussionResult = enforceCompactPayloadForTest(input, false);
    expect(discussionResult.content?.endsWith("…")).toBe(true);

    // Synthesis budget is 180 words, so this 160-word input is NOT cut.
    const synthesisResult = enforceCompactPayloadForTest(input, true);
    expect(synthesisResult.content?.endsWith("…")).toBe(false);
  });

  it("falls back to a default when content is missing", () => {
    const input = {
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: "ok",
    };
    const result = enforceCompactPayloadForTest(input, false);
    expect(result.content).toBeTruthy();
  });
});

describe("formatStructuredContent (free-form version)", () => {
  it("returns content as-is without adding bullets or headers", () => {
    const input = {
      content: "Orion, my read is that the pricing floor matters more than the ceiling here. We risk anchoring too low if we go to market at £5k.",
      confidence: 0.8,
      recommendedAction: "revise" as const,
      summaryRationale: "Guard the pricing floor.",
    };
    const result = formatStructuredContentForTest(input);
    expect(result).toBe(input.content);
  });

  it("does NOT prepend 'Position:' or bullet points to content", () => {
    const input = {
      content: "A plain sentence.",
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: "ok",
    };
    const result = formatStructuredContentForTest(input);
    expect(result).not.toMatch(/^Position:/i);
    expect(result).not.toMatch(/^-\s/);
    expect(result).toBe("A plain sentence.");
  });

  it("preserves paragraph breaks and inline bullets the agent chose to use", () => {
    const input = {
      content: "Three criteria matter here:\n- evidence quality\n- reversibility\n- cost ceiling\n\nThe last one is the gate.",
      confidence: 0.8,
      recommendedAction: "proceed" as const,
      summaryRationale: "Cost ceiling is the gate.",
    };
    const result = formatStructuredContentForTest(input);
    expect(result).toContain("\n- evidence quality");
    expect(result).toContain("\n\nThe last one");
  });

  it("returns a fallback string when no content is present", () => {
    const result = formatStructuredContentForTest({
      confidence: 0.5,
      recommendedAction: "proceed" as const,
      summaryRationale: "",
    });
    expect(result).toBe("No content returned.");
  });
});
