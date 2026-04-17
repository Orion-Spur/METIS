import type { CouncilContextEntry, MetisAgentOutput } from "@/lib/metisCouncil";

const originalEnv = { ...process.env };

const getCompanyProfile = vi.fn();

async function loadCouncilModule() {
  vi.resetModules();
  return import("@/lib/metisCouncil");
}

function createStructuredResponse(
  agentName: string,
  position: string,
  keyReasoning: string[],
  challenge: string,
  recommendedAction: MetisAgentOutput["recommendedAction"],
  confidence: number,
  summaryRationale: string,
) {
  return {
    position,
    keyReasoning,
    challenge,
    recommendedAction,
    confidence,
    summaryRationale,
  };
}

function createResponseQueue() {
  return {
    anthropicResponses: [
      createStructuredResponse(
        "Metis",
        "The first decision is how much launch complexity Orion should accept at day one.",
        [
          "We need a live frame before specialist disagreement begins.",
          "The initial decision should stay provisional.",
        ],
        "If we settle too early, Loki has no leverage to expose delivery risk.",
        "proceed",
        0.84,
        "The chair opens with a clear but non-final frame.",
      ),
      createStructuredResponse(
        "Metis",
        "The debate now turns on whether a phased launch is disciplined enough under scrutiny.",
        [
          "Athena offers structure but Argus still wants evidence.",
          "Loki has exposed execution fragility.",
          "The room still needs one sharper closing challenge.",
        ],
        "No decision is credible yet if the strongest commercial objection remains unresolved.",
        "revise",
        0.83,
        "The chair keeps pressure on the room instead of closing.",
      ),
      createStructuredResponse(
        "Metis",
        "Proceed with a phased launch, but only with explicit instrumentation and narrow scope.",
        [
          "Athena's path is usable once evidence gates are added.",
          "Argus gets measurable checkpoints before expansion.",
          "Loki's risk warning is contained by narrowing the first release.",
        ],
        "If instrumentation slips, the council should escalate the next decision to Orion.",
        "proceed",
        0.9,
        "The final recommendation preserves the strongest surviving risk.",
      ),
    ],
    azureResponses: [
      createStructuredResponse(
        "Athena",
        "Use a phased launch with a tightly sequenced first release.",
        [
          "A narrow first step reduces operational drag.",
          "Sequencing keeps Orion informed without constant escalation.",
        ],
        "Argus is right that we still need explicit success thresholds.",
        "proceed",
        0.82,
        "A phased path balances ambition and control.",
      ),
      createStructuredResponse(
        "Athena",
        "Keep the phased launch, but add explicit gates before each expansion step.",
        [
          "The first release should prove usage before scale.",
          "Risk falls when checkpoints are pre-committed.",
        ],
        "Loki is right that vague sequencing invites performative progress.",
        "revise",
        0.79,
        "The plan improves after absorbing criticism.",
      ),
    ],
    geminiResponses: [
      createStructuredResponse(
        "Argus",
        "I can support the direction only if evidence thresholds are named now.",
        [
          "The current path lacks measurable acceptance criteria.",
          "A launch without instrumentation weakens later judgment.",
        ],
        "Athena's sequencing is useful, but it remains under-specified.",
        "revise",
        0.74,
        "The architecture still needs measurable checkpoints.",
      ),
      createStructuredResponse(
        "Argus",
        "The revised path is acceptable if the first release is instrumented and reviewed quickly.",
        [
          "Evidence gates now exist at the right points.",
          "The decision remains reversible after the first release.",
        ],
        "If the team skips the review gate, the whole discipline collapses.",
        "proceed",
        0.76,
        "The evidence gap is smaller but not gone.",
      ),
    ],
    xaiResponses: [
      createStructuredResponse(
        "Loki",
        "The initial plan is too comfortable and assumes complexity will behave itself.",
        [
          "More orchestration means more ways to stall delivery.",
          "A soft launch story can hide lack of focus.",
        ],
        "Athena is still underestimating how easily scope can bloat.",
        "revise",
        0.77,
        "The first strategy underestimates delivery risk.",
      ),
      createStructuredResponse(
        "Loki",
        "The revised path is better, but it still fails if the team treats phase one as symbolic.",
        [
          "A narrow release must stay genuinely narrow.",
          "Instrumentation must drive action, not optics.",
        ],
        "Metis should not converge unless this risk is carried into the final recommendation.",
        "revise",
        0.81,
        "The final stress test preserves useful disagreement.",
      ),
    ],
  };
}

function createFetchMock() {
  const queues = createResponseQueue();

  return vi.fn(async (url: string) => {
    if (url.includes("azure.example.com")) {
      const response = queues.azureResponses.shift();
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(response),
              },
            },
          ],
        }),
      };
    }

    if (url.includes("generativelanguage.googleapis.com")) {
      const response = queues.geminiResponses.shift();
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(response),
                  },
                ],
              },
            },
          ],
        }),
      };
    }

    if (url.includes("api.x.ai")) {
      const response = queues.xaiResponses.shift();
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(response),
              },
            },
          ],
        }),
      };
    }

    const response = queues.anthropicResponses.shift();
    return {
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify(response),
          },
        ],
      }),
    };
  });
}

function createVerboseFetchMock() {
  const longPosition = Array.from({ length: 70 }, (_, index) => `position${index + 1}`).join(" ");
  const longReasoning = Array.from({ length: 6 }, (_, bulletIndex) =>
    Array.from({ length: 28 }, (_, wordIndex) => `reason${bulletIndex + 1}_${wordIndex + 1}`).join(" "),
  );
  const longChallenge = Array.from({ length: 28 }, (_, index) => `challenge${index + 1}`).join(" ");
  const longSummary = Array.from({ length: 25 }, (_, index) => `summary${index + 1}`).join(" ");

  return vi.fn(async (url: string) => {
    const response = {
      position: longPosition,
      keyReasoning: longReasoning,
      challenge: longChallenge,
      recommendedAction: "revise",
      confidence: 0.88,
      summaryRationale: longSummary,
    };

    if (url.includes("azure.example.com")) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(response) } }],
        }),
      };
    }

    if (url.includes("generativelanguage.googleapis.com")) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
        }),
      };
    }

    if (url.includes("api.x.ai")) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(response) } }],
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(response) }],
      }),
    };
  });
}

vi.mock("@/lib/db", () => ({
  getCompanyProfile,
}));

describe("METIS council orchestration", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "1234567890abcdef1234567890abcdef";
    process.env.ANTHROPIC_API_KEY = "anthropic-test";
    process.env.AZUREGPT54_API_KEY = "azure-test";
    process.env.AZUREGPT54_ENDPOINT = "https://azure.example.com";
    process.env.AZUREGPT54_DEPLOYMENT = "gpt-55";
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.XAI_API_KEY = "xai-test";
    getCompanyProfile.mockResolvedValue({
      id: 1,
      slug: "default",
      name: "Calling All Minds",
      mission: "Build decision systems that help teams reason clearly.",
      products: "METIS multi-agent council and related operating tools.",
      customers: "Leadership teams and operating stakeholders.",
      constraints: "Stay lean, keep runtime cost disciplined, and prioritise trustworthy memory.",
      teamSize: 6,
      stage: "Operating build phase",
      operatingModel: "Small product team with direct founder involvement.",
      geography: "UK",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    getCompanyProfile.mockReset();
    vi.restoreAllMocks();
  });

  it("runs a chaired multi-turn debate before producing the final Metis synthesis", async () => {
    const fetchMock = createFetchMock();

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const turn = await council.orchestrateCouncilTurn({
      sessionId: "session-1",
      userMessage: "Design the initial METIS architecture for a Vercel-first launch.",
    });

    expect(turn.sessionId).toBe("session-1");
    expect(turn.discussion.map((message) => message.agentName)).toEqual([
      "Metis",
      "Athena",
      "Argus",
      "Loki",
      "Metis",
      "Athena",
      "Argus",
      "Loki",
    ]);
    expect(turn.discussion.map((message) => message.sequenceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(turn.synthesis.agentName).toBe("Metis");
    expect(turn.synthesis.sequenceOrder).toBe(9);
    expect(turn.synthesis.recommendedAction).toBe("proceed");
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("formats every council turn into compact position, reasoning, and challenge sections", async () => {
    const fetchMock = createFetchMock();

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const turn = await council.orchestrateCouncilTurn({
      sessionId: "session-compact",
      userMessage: "Decide the right launch shape for METIS.",
    });

    for (const message of [...turn.discussion, turn.synthesis]) {
      expect(message.content).toContain("Position\n");
      expect(message.content).toContain("\n\nKey reasoning\n");
      expect(message.content).toContain("\n\nChallenge\n-");
      const reasoningLines = message.content
        .split("\n")
        .filter((line) => line.startsWith("- "));
      expect(reasoningLines.length).toBeLessThanOrEqual(6);
    }
  });

  it("enforces compact runtime limits even when a provider returns overlong structured output", async () => {
    const fetchMock = createVerboseFetchMock();

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const turn = await council.orchestrateCouncilTurn({
      sessionId: "session-overlong",
      userMessage: "Prove the runtime truncation path works even when providers overshare.",
    });

    const firstDiscussionLines = turn.discussion[0].content.split("\n");
    const discussionPositionWords = firstDiscussionLines[1].split(" ").filter(Boolean);
    const discussionReasoningLines = firstDiscussionLines.filter((line) => line.startsWith("- "));
    const discussionChallengeWords = String(discussionReasoningLines.at(-1)).replace(/^-\s*/, "").split(" ").filter(Boolean);

    expect(discussionPositionWords.length).toBeLessThanOrEqual(45);
    expect(discussionReasoningLines.length).toBeLessThanOrEqual(4);
    expect(discussionChallengeWords.length).toBeLessThanOrEqual(18);
    expect(turn.discussion[0].summaryRationale.split(" ").filter(Boolean).length).toBeLessThanOrEqual(20);
    expect(turn.synthesis.content.split("\n").filter((line) => line.startsWith("- ")).length).toBeLessThanOrEqual(5);
  });

  it("requires the full council challenge round before the chair can converge", async () => {
    const fetchMock = createFetchMock();

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const turn = await council.orchestrateCouncilTurn({
      sessionId: "session-challenge",
      userMessage: "Stress test whether the council converges too early.",
    });

    expect(council.getCouncilRoundState(turn.discussion)).toEqual({
      openingRoundComplete: true,
      challengeRoundComplete: true,
    });
    expect(council.hasRequiredChallengeRound(turn.discussion.slice(0, 4))).toBe(false);
    expect(council.hasRequiredChallengeRound(turn.discussion)).toBe(true);
    expect(turn.discussion.at(-1)?.agentName).toBe("Loki");
    expect(turn.synthesis.content).toContain("If instrumentation slips, the council should escalate the next decision to Orion.");

    const synthesisPromptBody = JSON.parse(String(fetchMock.mock.calls[8]?.[1]?.body ?? "{}"));
    expect(synthesisPromptBody.messages[0].content).toContain(
      "You may converge now only because the required challenge round has occurred.",
    );
  });

  it("emits each council contribution incrementally before the final synthesis", async () => {
    const fetchMock = createFetchMock();
    const events: Array<{ kind: string; agentName: string }> = [];

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const result = await council.streamCouncilTurn({
      sessionId: "session-2",
      userMessage: "Debate the launch sequencing in a way Orion can monitor live.",
      onEvent: (event) => {
        events.push({ kind: event.kind, agentName: event.message.agentName });
      },
    });

    expect(result.completed).toBe(true);
    expect(events).toHaveLength(9);
    expect(events.slice(0, 8).every((event) => event.kind === "discussion")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "synthesis", agentName: "Metis" });
    expect(result.synthesis?.sequenceOrder).toBe(9);
  });

  it("injects company context into the council prompt assembly", async () => {
    const fetchMock = createFetchMock();

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    await council.streamCouncilTurn({
      sessionId: "session-company",
      userMessage: "Debate the first operating architecture for METIS.",
    });

    const anthropicCallBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(anthropicCallBody.messages[0].content).toContain("Company context:");
    expect(anthropicCallBody.messages[0].content).toContain("Calling All Minds");
    expect(anthropicCallBody.messages[0].content).toContain("trustworthy memory");
  });

  it("reuses live Orion interjection context when the discussion is resumed mid-stream", async () => {
    const fetchMock = createFetchMock();
    const historyEntries: CouncilContextEntry[] = [
      {
        role: "user",
        speakerName: "Orion",
        content: "We are already live. Do not restart from first principles.",
        sequenceOrder: 1,
      },
      {
        role: "agent",
        speakerName: "Metis",
        content: "Position\nUnderstood. I will keep the council focused on the current crux.\n\nKey reasoning\n- The live constraint is now part of the frame.\n\nChallenge\n- If we forget the current state, the discussion resets unnecessarily.",
        sequenceOrder: 2,
        confidence: 0.84,
        recommendedAction: "proceed",
        summaryRationale: "The chair has acknowledged Orion's first constraint.",
      },
      {
        role: "user",
        speakerName: "Orion",
        content: "Interjection: focus on whether Athena's rollout is too slow.",
        sequenceOrder: 3,
      },
    ];

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    await council.streamCouncilTurn({
      sessionId: "session-3",
      userMessage: "Continue the debate from the current live discussion.",
      historyEntries,
    });

    const anthropicCallBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(anthropicCallBody.messages[0].content).toContain(
      "Interjection: focus on whether Athena's rollout is too slow.",
    );
    expect(anthropicCallBody.messages[0].content).toContain(
      "Do not restart from first principles.",
    );
  });
});
