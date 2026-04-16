import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CouncilTurnCard from "@/components/CouncilTurnCard";
import type { MetisCouncilTurn } from "@/shared/metis";

const sampleTurn: MetisCouncilTurn = {
  sessionId: "session-1",
  userMessage: "Should METIS run a live chaired debate instead of a one-shot answer?",
  createdAt: 1713297600000,
  discussion: [
    {
      sequenceOrder: 1,
      agentName: "Metis",
      content: "I am opening the meeting and naming the core tension between speed and rigor.",
      confidence: 0.86,
      recommendedAction: "proceed",
      summaryRationale: "A chaired opening frames the debate.",
    },
    {
      sequenceOrder: 2,
      agentName: "Athena",
      content: "We should adopt a structured multi-turn format so the reasoning evolves visibly.",
      confidence: 0.8,
      recommendedAction: "proceed",
      summaryRationale: "The product needs visible deliberation, not hidden synthesis.",
    },
    {
      sequenceOrder: 3,
      agentName: "Loki",
      content: "If the discussion is superficial, the format becomes theater rather than scrutiny.",
      confidence: 0.9,
      recommendedAction: "revise",
      summaryRationale: "The structure must preserve genuine adversarial friction.",
    },
  ],
  synthesis: {
    sequenceOrder: 4,
    agentName: "Metis",
    content: "Adopt the chaired debate and measure whether disagreement changes outcomes.",
    confidence: 0.88,
    recommendedAction: "proceed",
    summaryRationale: "The council agrees on the direction while preserving Loki's warning.",
  },
};

describe("CouncilTurnCard", () => {
  it("renders the chaired discussion in chronological exchange order before the final synthesis", () => {
    const markup = renderToStaticMarkup(<CouncilTurnCard turn={sampleTurn} turnIndex={0} />);

    expect(markup).toContain("Active discussion");
    expect(markup).toContain("Metis synthesis");
    expect(markup).toContain("Exchange 1");
    expect(markup).toContain("Exchange 4");

    const metisIndex = markup.indexOf("I am opening the meeting");
    const athenaIndex = markup.indexOf("We should adopt a structured multi-turn format");
    const lokiIndex = markup.indexOf("If the discussion is superficial");
    const synthesisIndex = markup.indexOf("Adopt the chaired debate and measure whether disagreement changes outcomes");

    expect(metisIndex).toBeGreaterThan(-1);
    expect(athenaIndex).toBeGreaterThan(metisIndex);
    expect(lokiIndex).toBeGreaterThan(athenaIndex);
    expect(synthesisIndex).toBeGreaterThan(lokiIndex);
  });
});
