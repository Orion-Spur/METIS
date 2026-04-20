import { describe, expect, it } from "vitest";
import { isLowProgressRound, scoreNovelty, shouldForceClosure } from "@/lib/noveltyDetector";
import type { MetisCouncilMessage } from "@/shared/metis";

function buildMessage(content: string, overrides: Partial<MetisCouncilMessage> = {}): MetisCouncilMessage {
  return {
    sequenceOrder: 0,
    agentName: "Athena",
    content,
    confidence: 0.8,
    recommendedAction: "proceed",
    summaryRationale: "",
    memoryIntervention: null,
    ...overrides,
  };
}

describe("scoreNovelty", () => {
  it("returns full novelty for the first message in a round", () => {
    const result = scoreNovelty(buildMessage("anything here"), []);
    expect(result.score).toBe(1);
    expect(result.reasons).toContain("first message in round");
  });

  it("scores higher when a message introduces new numeric thresholds", () => {
    const prior = [buildMessage("We should ship fast")];
    const withNumbers = scoreNovelty(
      buildMessage("Cap cost-per-action at £12 and enforce a 30% reply-rate floor", {
        agentName: "Argus",
      }),
      prior
    );
    expect(withNumbers.score).toBeGreaterThan(0.5);
    expect(withNumbers.reasons.some((r) => r.includes("numeric"))).toBe(true);
  });

  it("scores low for a message that mostly repeats prior vocabulary", () => {
    const prior = [
      buildMessage("We should ship fast with four roles using the baseline approach"),
    ];
    const repetitive = scoreNovelty(
      buildMessage("We should ship fast with four roles using the baseline approach indeed", {
        agentName: "Athena",
      }),
      prior
    );
    expect(repetitive.score).toBeLessThan(0.35);
  });

  it("flags threshold language in the reasons when it's newly introduced", () => {
    const result = scoreNovelty(
      buildMessage("Set a minimum threshold of three pilot outcomes before expanding"),
      [buildMessage("Unrelated opening context about strategy")]
    );
    expect(result.reasons.some((r) => r.includes("threshold"))).toBe(true);
  });

  it("does NOT flag threshold language when it's already in the prior context", () => {
    const result = scoreNovelty(
      buildMessage("We should apply the threshold approach here too"),
      [buildMessage("The threshold concept was already raised previously")]
    );
    expect(result.reasons.some((r) => r.includes("threshold"))).toBe(false);
  });
});

describe("isLowProgressRound", () => {
  it("returns false for a round with new numeric thresholds and new vocabulary", () => {
    const priorContext = [buildMessage("Initial brief framing about outreach engine design")];
    const round = [
      buildMessage("Pilot at £8k across three industry sectors to measure conversion"),
      buildMessage(
        "Require a 15% reply rate and 4% conversion before scaling beyond pilot segment",
        { agentName: "Argus" }
      ),
      buildMessage(
        "If pilot fails, enterprise-tier assumption collapses and we rethink positioning",
        { agentName: "Loki" }
      ),
    ];
    expect(isLowProgressRound(round, priorContext)).toBe(false);
  });

  it("returns true for a round of messages that all repeat prior vocabulary", () => {
    const priorContext = [
      buildMessage("We need a baseline approach using the standard model for our plan"),
    ];
    const round = [
      buildMessage("The baseline standard model approach we plan needs to use"),
      buildMessage("Our standard baseline model plan uses the approach needs", {
        agentName: "Argus",
      }),
      buildMessage("Standard baseline plan approach model we use needs", {
        agentName: "Loki",
      }),
    ];
    expect(isLowProgressRound(round, priorContext)).toBe(true);
  });

  it("returns false for an empty round", () => {
    expect(isLowProgressRound([])).toBe(false);
  });
});

describe("shouldForceClosure", () => {
  it("does not force closure when there aren't yet two full rounds of history", () => {
    const discussion = [
      buildMessage("first"),
      buildMessage("second"),
      buildMessage("third"),
    ];
    expect(shouldForceClosure(discussion, 3).force).toBe(false);
  });

  it("forces closure when two consecutive rounds are low-progress", () => {
    // In the real app, there's always a chair opening and opening round
    // before we ever check for closure. Mirror that here.
    const openingRound = [
      buildMessage("Opening: the central tension is whether four roles exceed what the baseline data justifies at this stage"),
      buildMessage("Initial path: pilot the minimum viable team and measure conversion before scaling", { agentName: "Athena" }),
      buildMessage("Evidence missing: no benchmark for cost-per-conversion in this sector yet", { agentName: "Argus" }),
      buildMessage("Risk: adding complexity before measurement traps us in sunk-cost reasoning later", { agentName: "Loki" }),
    ];
    const lowRoundA = [
      buildMessage("The baseline standard approach we plan needs to use"),
      buildMessage("Our standard baseline plan uses the approach needs", { agentName: "Argus" }),
      buildMessage("Standard baseline plan approach we use needs", { agentName: "Loki" }),
    ];
    const lowRoundB = [
      buildMessage("Baseline standard plan approach needs uses we"),
      buildMessage("Plan standard approach baseline uses needs", { agentName: "Argus" }),
      buildMessage("Approach baseline standard plan needs uses", { agentName: "Loki" }),
    ];
    const discussion = [...openingRound, ...lowRoundA, ...lowRoundB];
    const result = shouldForceClosure(discussion, 3);
    expect(result.force).toBe(true);
    expect(result.reason).toMatch(/two consecutive rounds/);
  });

  it("does not force closure if the most recent round introduced new material", () => {
    const openingRound = [
      buildMessage("Opening: central tension is whether four roles exceed what baseline data justifies"),
      buildMessage("Initial path: pilot minimum viable team and measure", { agentName: "Athena" }),
      buildMessage("Evidence missing: no benchmark for cost-per-conversion yet", { agentName: "Argus" }),
      buildMessage("Risk: complexity before measurement traps us later", { agentName: "Loki" }),
    ];
    const lowRound = [
      buildMessage("The baseline standard plan uses the approach we need"),
      buildMessage("Standard baseline approach plan uses needs", { agentName: "Argus" }),
      buildMessage("Baseline standard plan approach needs uses", { agentName: "Loki" }),
    ];
    const newRound = [
      buildMessage("Cap cost-per-action at £12 with a 30% reply-rate threshold and 4% conversion floor"),
      buildMessage(
        "Require pilot of 200 contacts across Leader-tier education segment before expansion",
        { agentName: "Argus" }
      ),
      buildMessage(
        "If Q2 conversion under 3% we kill the pilot and re-examine enterprise positioning entirely",
        { agentName: "Loki" }
      ),
    ];
    const discussion = [...openingRound, ...lowRound, ...newRound];
    expect(shouldForceClosure(discussion, 3).force).toBe(false);
  });
});
