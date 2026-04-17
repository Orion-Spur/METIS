import type { CouncilContextEntry } from "@/lib/metisCouncil";

const originalEnv = { ...process.env };

async function loadCouncilModule() {
  vi.resetModules();
  return import("@/lib/metisCouncil");
}

function createResponseQueue() {
  return {
    anthropicResponses: [
      {
        content: "Metis opens the meeting by naming the core product tension.",
        confidence: 0.84,
        recommendedAction: "proceed",
        summaryRationale: "A chaired opening gives the specialists a shared frame.",
      },
      {
        content: "Metis identifies the unresolved tension and requests sharper closing positions.",
        confidence: 0.83,
        recommendedAction: "revise",
        summaryRationale: "The midpoint intervention keeps the discussion adversarial.",
      },
      {
        content: "Metis closes with a synthesized recommendation after the debate.",
        confidence: 0.9,
        recommendedAction: "proceed",
        summaryRationale: "The specialists now provide enough material for a decisive close.",
      },
    ],
    azureResponses: [
      {
        content: "Athena proposes a phased launch with explicit sequencing.",
        confidence: 0.82,
        recommendedAction: "proceed",
        summaryRationale: "A phased path balances ambition and control.",
      },
      {
        content: "Athena tightens the rollout after Argus and Loki raise objections.",
        confidence: 0.79,
        recommendedAction: "revise",
        summaryRationale: "The plan improves once the critique is absorbed.",
      },
    ],
    geminiResponses: [
      {
        content: "Argus identifies missing evidence thresholds and validation criteria.",
        confidence: 0.74,
        recommendedAction: "revise",
        summaryRationale: "The architecture still needs measurable checkpoints.",
      },
      {
        content: "Argus says the revised path is acceptable only if the next experiment is instrumented.",
        confidence: 0.76,
        recommendedAction: "proceed",
        summaryRationale: "The evidence gap is smaller but not gone.",
      },
    ],
    xaiResponses: [
      {
        content: "Loki flags orchestration complexity and timeout risk in the initial plan.",
        confidence: 0.77,
        recommendedAction: "revise",
        summaryRationale: "The first strategy underestimates delivery risk.",
      },
      {
        content: "Loki says the revised plan is better but still vulnerable to performative consensus.",
        confidence: 0.81,
        recommendedAction: "revise",
        summaryRationale: "The final stress test preserves useful disagreement.",
      },
    ],
  };
}

function createFetchMock() {
  const queues = createResponseQueue();

  return vi.fn(async (url: string, init?: RequestInit) => {
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

describe("METIS council orchestration", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "1234567890abcdef1234567890abcdef";
    process.env.ANTHROPIC_API_KEY = "anthropic-test";
    process.env.AZUREGPT54_API_KEY = "azure-test";
    process.env.AZUREGPT54_ENDPOINT = "https://azure.example.com";
    process.env.AZUREGPT54_DEPLOYMENT = "gpt-55";
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.XAI_API_KEY = "xai-test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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
        content: "Understood. I will keep the council focused on the current crux.",
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
