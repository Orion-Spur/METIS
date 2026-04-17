const getCurrentSession = vi.fn();
const appendCouncilMessage = vi.fn();
const listCouncilTurns = vi.fn();
const startCouncilSessionTurn = vi.fn();
const streamCouncilTurn = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentSession,
}));

vi.mock("@/lib/db", () => ({
  appendCouncilMessage,
  listCouncilTurns,
  startCouncilSessionTurn,
}));

vi.mock("@/lib/metisCouncil", () => ({
  streamCouncilTurn,
}));

async function loadRouteModule() {
  vi.resetModules();
  return import("@/app/api/council/route");
}

describe("METIS streaming council route", () => {
  beforeEach(() => {
    getCurrentSession.mockReset();
    appendCouncilMessage.mockReset();
    listCouncilTurns.mockReset();
    startCouncilSessionTurn.mockReset();
    streamCouncilTurn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns newline-delimited streaming events and passes live context into the council stream", async () => {
    getCurrentSession.mockResolvedValue({
      userId: 7,
      username: "orion",
      role: "admin",
    });
    listCouncilTurns.mockResolvedValue([]);
    startCouncilSessionTurn.mockResolvedValue({
      sessionId: "session-live",
      sequenceOrder: 1,
    });
    appendCouncilMessage
      .mockResolvedValueOnce({ sequenceOrder: 2 })
      .mockResolvedValueOnce({ sequenceOrder: 3 });

    streamCouncilTurn.mockImplementation(async ({ onEvent, historyEntries }) => {
      expect(historyEntries).toEqual([
        {
          role: "user",
          speakerName: "Orion",
          content: "Previous visible Orion note.",
          sequenceOrder: 4,
        },
      ]);

      await onEvent({
        kind: "discussion",
        message: {
          agentName: "Metis",
          content: "Metis opens the live stream.",
          sequenceOrder: 1,
          confidence: 0.82,
          recommendedAction: "proceed",
          summaryRationale: "The chair should appear first.",
        },
      });

      await onEvent({
        kind: "synthesis",
        message: {
          agentName: "Metis",
          content: "Metis closes the live stream.",
          sequenceOrder: 2,
          confidence: 0.88,
          recommendedAction: "proceed",
          summaryRationale: "The closing synthesis ends the turn.",
        },
      });

      return {
        sessionId: "session-live",
        userMessage: "Continue the discussion live.",
        discussion: [],
        synthesis: null,
        createdAt: Date.now(),
        completed: true,
      };
    });

    const route = await loadRouteModule();
    const response = await route.POST(
      new Request("http://localhost/api/council", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "session-live",
          message: "Continue the discussion live.",
          liveContext: [
            {
              role: "user",
              speakerName: "Orion",
              content: "Previous visible Orion note.",
              sequenceOrder: 4,
            },
          ],
        }),
      }),
    );

    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(lines[0]).toEqual({
      type: "start",
      sessionId: "session-live",
      userMessage: "Continue the discussion live.",
    });
    expect(lines[1]).toMatchObject({
      type: "message",
      kind: "discussion",
      sessionId: "session-live",
      message: {
        agentName: "Metis",
        content: "Metis opens the live stream.",
        sequenceOrder: 2,
      },
    });
    expect(lines[2]).toMatchObject({
      type: "message",
      kind: "synthesis",
      sessionId: "session-live",
      message: {
        agentName: "Metis",
        content: "Metis closes the live stream.",
        sequenceOrder: 3,
      },
    });
    expect(lines[3]).toEqual({
      type: "complete",
      sessionId: "session-live",
      completed: true,
    });
  });
});
