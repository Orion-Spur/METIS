import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadCouncilModule() {
  vi.resetModules();
  return import("@/lib/metisCouncil");
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

  it("routes specialist turns first and then produces a Metis synthesis", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("azure.example.com")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    content: "Athena recommends a phased launch.",
                    confidence: 0.82,
                    recommendedAction: "proceed",
                    summaryRationale: "A phased launch balances speed and control.",
                  }),
                },
              },
            ],
          }),
        };
      }

      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        content: "Argus identifies missing validation criteria.",
                        confidence: 0.74,
                        recommendedAction: "revise",
                        summaryRationale: "The architecture needs clearer measurement criteria.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      }

      if (url.includes("api.x.ai")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    content: "Loki flags orchestration complexity and timeout risk.",
                    confidence: 0.77,
                    recommendedAction: "revise",
                    summaryRationale: "Long-running tasks should move off Vercel later.",
                  }),
                },
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                content: "Metis synthesises the council into one coordinated recommendation.",
                confidence: 0.88,
                recommendedAction: "proceed",
                summaryRationale: "The specialists largely agree on the path with manageable risks.",
              }),
            },
          ],
        }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);
    const council = await loadCouncilModule();
    const turn = await council.orchestrateCouncilTurn({
      sessionId: "session-1",
      userMessage: "Design the initial METIS architecture for a Vercel-first launch.",
    });

    expect(turn.sessionId).toBe("session-1");
    expect(turn.outputs.map((output) => output.agentName)).toEqual(["Athena", "Argus", "Loki"]);
    expect(turn.synthesis.agentName).toBe("Metis");
    expect(turn.synthesis.recommendedAction).toBe("proceed");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
