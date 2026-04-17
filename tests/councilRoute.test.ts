const getCurrentSession = vi.fn();
const appendCouncilMessage = vi.fn();
const listCouncilTurns = vi.fn();
const listRelevantSessionInsights = vi.fn();
const refreshSessionInsight = vi.fn();
const startCouncilSessionTurn = vi.fn();
const streamCouncilTurn = vi.fn();
const flattenTurnsToContextEntries = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentSession,
}));

vi.mock("@/lib/db", () => ({
  appendCouncilMessage,
  listCouncilTurns,
  listRelevantSessionInsights,
  refreshSessionInsight,
  startCouncilSessionTurn,
}));

vi.mock("@/lib/metisCouncil", () => ({
  flattenTurnsToContextEntries,
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
    listRelevantSessionInsights.mockReset();
    refreshSessionInsight.mockReset();
    startCouncilSessionTurn.mockReset();
    streamCouncilTurn.mockReset();
    flattenTurnsToContextEntries.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns newline-delimited streaming events and prefers persisted session memory over client live context", async () => {
    getCurrentSession.mockResolvedValue({
      userId: 7,
      username: "orion",
      role: "admin",
    });
    listCouncilTurns.mockResolvedValue([
      {
        sessionId: "session-live",
        userMessage: "Earlier Orion brief.",
        discussion: [
          {
            agentName: "Metis",
            content: "Metis framed the earlier discussion.",
            sequenceOrder: 2,
            confidence: 0.76,
            recommendedAction: "proceed",
            summaryRationale: "The chair opened the first turn.",
          },
        ],
        synthesis: {
          agentName: "Metis",
          content: "Metis closed the earlier turn.",
          sequenceOrder: 3,
          confidence: 0.8,
          recommendedAction: "revise",
          summaryRationale: "The earlier turn concluded with a refinement.",
        },
        createdAt: Date.now(),
      },
    ]);
    flattenTurnsToContextEntries.mockReturnValue([
      {
        role: "user",
        speakerName: "Orion",
        content: "Earlier Orion brief.",
        sequenceOrder: 1,
      },
      {
        role: "agent",
        speakerName: "Metis",
        content: "Metis framed the earlier discussion.",
        sequenceOrder: 2,
        confidence: 0.76,
        recommendedAction: "proceed",
        summaryRationale: "The chair opened the first turn.",
      },
      {
        role: "synthesis",
        speakerName: "Metis",
        content: "Metis closed the earlier turn.",
        sequenceOrder: 3,
        confidence: 0.8,
        recommendedAction: "revise",
        summaryRationale: "The earlier turn concluded with a refinement.",
      },
    ]);
    listRelevantSessionInsights.mockResolvedValue([
      {
        id: 11,
        sessionId: "session-previous",
        title: "Earlier launch lesson",
        insight: "Start narrower than the founder instinct suggests.",
        rationale: "Previous councils found sequencing was the main risk reducer.",
        tags: ["launch", "sequencing"],
        updatedAt: Date.now(),
      },
    ]);
    startCouncilSessionTurn.mockResolvedValue({
      sessionId: "session-live",
      sequenceOrder: 1,
    });
    appendCouncilMessage
      .mockResolvedValueOnce({ sequenceOrder: 2 })
      .mockResolvedValueOnce({ sequenceOrder: 3 });

    streamCouncilTurn.mockImplementation(async ({ onEvent, historyEntries, relatedInsights }) => {
      expect(historyEntries).toEqual([
        {
          role: "user",
          speakerName: "Orion",
          content: "Earlier Orion brief.",
          sequenceOrder: 1,
        },
        {
          role: "agent",
          speakerName: "Metis",
          content: "Metis framed the earlier discussion.",
          sequenceOrder: 2,
          confidence: 0.76,
          recommendedAction: "proceed",
          summaryRationale: "The chair opened the first turn.",
        },
        {
          role: "synthesis",
          speakerName: "Metis",
          content: "Metis closed the earlier turn.",
          sequenceOrder: 3,
          confidence: 0.8,
          recommendedAction: "revise",
          summaryRationale: "The earlier turn concluded with a refinement.",
        },
      ]);
      expect(relatedInsights).toEqual([
        {
          id: 11,
          sessionId: "session-previous",
          title: "Earlier launch lesson",
          insight: "Start narrower than the founder instinct suggests.",
          rationale: "Previous councils found sequencing was the main risk reducer.",
          tags: ["launch", "sequencing"],
          updatedAt: expect.any(Number),
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
        synthesis: {
          agentName: "Metis",
          content: "Metis closes the live stream.",
          sequenceOrder: 2,
          confidence: 0.88,
          recommendedAction: "proceed",
          summaryRationale: "The closing synthesis ends the turn.",
        },
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

    expect(listRelevantSessionInsights).toHaveBeenCalledWith({
      userId: 7,
      query: "Continue the discussion live.",
      excludeSessionId: "session-live",
      limit: 3,
    });
    expect(refreshSessionInsight).toHaveBeenCalledWith({
      sessionId: "session-live",
      userId: 7,
    });

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

  it("does not enqueue a council message after the request is aborted while persistence is still in flight", async () => {
    vi.useFakeTimers();

    getCurrentSession.mockResolvedValue({
      userId: 7,
      username: "orion",
      role: "admin",
    });
    listCouncilTurns.mockResolvedValue([]);
    flattenTurnsToContextEntries.mockReturnValue([]);
    listRelevantSessionInsights.mockResolvedValue([]);
    startCouncilSessionTurn.mockResolvedValue({
      sessionId: "session-abort",
      sequenceOrder: 1,
    });

    let resolvePersist: ((value: { sequenceOrder: number }) => void) | undefined;
    appendCouncilMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePersist = resolve;
        }),
    );

    const abortController = new AbortController();

    streamCouncilTurn.mockImplementation(async ({ onEvent }) => {
      const eventPromise = onEvent({
        kind: "discussion",
        message: {
          agentName: "Metis",
          content: "This message should never be enqueued after abort.",
          sequenceOrder: 1,
          confidence: 0.7,
          recommendedAction: "proceed",
          summaryRationale: "Abort should suppress the outbound event.",
        },
      });

      abortController.abort();
      resolvePersist?.({ sequenceOrder: 2 });
      await eventPromise;

      return {
        sessionId: "session-abort",
        userMessage: "Abort this stream.",
        discussion: [],
        synthesis: null,
        createdAt: Date.now(),
        completed: false,
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
          sessionId: "session-abort",
          message: "Abort this stream.",
        }),
        signal: abortController.signal,
      }),
    );

    await vi.runAllTimersAsync();

    const lines = (await response.text())
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(appendCouncilMessage).toHaveBeenCalledTimes(1);
    expect(refreshSessionInsight).not.toHaveBeenCalled();
    expect(lines).toEqual([
      {
        type: "start",
        sessionId: "session-abort",
        userMessage: "Abort this stream.",
      },
    ]);

    vi.useRealTimers();
  });
});
