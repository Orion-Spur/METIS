import { describe, expect, it, vi } from "vitest";
import { decideNextMove } from "@/lib/chairDirector";
import type { MetisCouncilLearning, MetisCouncilMessage } from "@/shared/metis";

function mockAnthropicResponse(payload: unknown): Response {
  const body = {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload),
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function buildMessage(overrides: Partial<MetisCouncilMessage>): MetisCouncilMessage {
  return {
    sequenceOrder: 0,
    agentName: "Metis",
    content: "placeholder",
    confidence: 0.8,
    recommendedAction: "proceed",
    summaryRationale: "",
    memoryIntervention: null,
    ...overrides,
  };
}

function buildLearning(overrides: Partial<MetisCouncilLearning>): MetisCouncilLearning {
  return {
    id: 1,
    sessionId: "s1",
    kind: "decision",
    statement: "Price AXS Audit at £8k for the practitioner tier.",
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

describe("decideNextMove", () => {
  it("returns a parsed directive when the director produces valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_specialist",
        target: "Loki",
        directive: "Challenge Athena's assumption that four roles are needed before the baseline exists.",
        rationale: "The room needs targeted pressure on the complexity claim.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "Design the outreach engine.",
      discussion: [buildMessage({ agentName: "Athena", content: "Four roles is correct." })],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_specialist");
    expect(result.target).toBe("Loki");
    expect(result.directive).toContain("Athena");
  });

  it("overrides synthesise to call_round when challenge round is not complete", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "synthesise",
        target: null,
        directive: "Close the room, synthesise now.",
        rationale: "Room is ready to close.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_round");
    expect(result.rationale).toContain("challenge round");
  });

  it("allows synthesise when the challenge round is complete", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "synthesise",
        target: null,
        directive: "Close the room, synthesise now.",
        rationale: "Room is ready to close.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: true,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("synthesise");
  });

  it("forces synthesise when closure has been forced by the route", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_round",
        target: null,
        directive: "Bring all specialists for one more round.",
        rationale: "Debate needs another round.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: true,
      elapsedSeconds: 260,
      timeoutSeconds: 270,
      forceClosureReason: "two low-progress rounds",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("synthesise");
    expect(result.rationale).toContain("two low-progress rounds");
  });

  it("passes through memory intervention when director attaches one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_specialist",
        target: "Athena",
        directive: "Address the prior pricing decision.",
        rationale: "Relitigation of prior decision detected.",
        memoryIntervention: {
          learningId: 42,
          reason: "Athena is proposing a new price that contradicts the prior decision.",
        },
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [buildLearning({ id: 42 })],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.memoryIntervention).toEqual({
      learningId: 42,
      reason: "Athena is proposing a new price that contradicts the prior decision.",
    });
  });

  it("nulls target when action is not call_specialist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_round",
        target: "Loki",
        directive: "Bring all specialists back for another round.",
        rationale: "Debate should continue further.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_round");
    expect(result.target).toBeNull();
  });

  it("defaults target to Loki if call_specialist is chosen without a target", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_specialist",
        target: null,
        directive: "One of the specialists should respond now.",
        rationale: "The room needs challenging pushback now.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_specialist");
    expect(result.target).toBe("Loki");
  });

  it("strips markdown fences from the director's response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse(
        '```json\n{"action":"call_round","target":null,"directive":"Next round.","rationale":"Need more angles.","memoryIntervention":null}\n```'
      )
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_round");
  });

  it("throws when the director returns non-JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockAnthropicResponse("sorry I cannot help"));

    await expect(
      decideNextMove({
        brief: "x",
        discussion: [],
        availableLearnings: [],
        openingRoundComplete: true,
        challengeRoundComplete: false,
        elapsedSeconds: 30,
        timeoutSeconds: 270,
        forceClosureReason: null,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      })
    ).rejects.toThrow(/non-JSON/);
  });

  it("throws when the director JSON fails schema validation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "invalid_action",
        target: null,
        directive: "x",
        rationale: "y",
      })
    );

    await expect(
      decideNextMove({
        brief: "x",
        discussion: [],
        availableLearnings: [],
        openingRoundComplete: true,
        challengeRoundComplete: false,
        elapsedSeconds: 30,
        timeoutSeconds: 270,
        forceClosureReason: null,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      })
    ).rejects.toThrow(/schema/);
  });

  it("throws when the API returns a non-2xx status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("server error", { status: 500 }));

    await expect(
      decideNextMove({
        brief: "x",
        discussion: [],
        availableLearnings: [],
        openingRoundComplete: true,
        challengeRoundComplete: false,
        elapsedSeconds: 30,
        timeoutSeconds: 270,
        forceClosureReason: null,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      })
    ).rejects.toThrow(/500/);
  });

  it("passes chair_speaks through with target nulled", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "chair_speaks",
        target: null,
        directive: "Reframe the debate: both specialists are arguing about volume but neither has named the cost ceiling.",
        rationale: "The room is missing the cost dimension entirely.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "Pricing question.",
      discussion: [buildMessage({ agentName: "Athena", content: "Go high." }), buildMessage({ agentName: "Argus", content: "Go low." })],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("chair_speaks");
    expect(result.target).toBeNull();
    expect(result.directive).toContain("cost ceiling");
  });

  it("nulls target when chair_speaks is returned with a target", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "chair_speaks",
        target: "Athena",
        directive: "Chair intervention on the pricing question before the next round.",
        rationale: "Chair has a reframe to offer on the pricing tension.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("chair_speaks");
    expect(result.target).toBeNull();
  });

  it("accepts a long directive that would have failed the old 400-char limit", async () => {
    // A realistic rich directive that runs past 400 chars — this used to
    // crash the session before the schema was widened.
    const longDirective = "Athena, respond specifically to Argus's 40% uptake assumption by naming the evidence base for that figure. If no pre-existing benchmark exists in the room, the AXS Passport routing proposal becomes a design without a foundation and we need to know whether to keep building it or strip back to the simpler optional model that Metis proposed. Be specific about what evidence would be sufficient to keep the proposal alive.";
    expect(longDirective.length).toBeGreaterThan(400);

    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        action: "call_specialist",
        target: "Athena",
        directive: longDirective,
        rationale: "Athena's argument rests on an unsourced uptake claim that needs evidence.",
        memoryIntervention: null,
      })
    );

    const result = await decideNextMove({
      brief: "x",
      discussion: [],
      availableLearnings: [],
      openingRoundComplete: true,
      challengeRoundComplete: false,
      elapsedSeconds: 30,
      timeoutSeconds: 270,
      forceClosureReason: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.action).toBe("call_specialist");
    expect(result.directive).toBe(longDirective);
  });
});
