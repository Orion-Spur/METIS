import { describe, expect, it } from "vitest";
import { reconstructCouncilTurns } from "@/lib/db";

const now = new Date("2026-04-16T20:00:00.000Z");

describe("METIS persistence helpers", () => {
  it("reconstructs multiple council turns within a single session in chronological order", () => {
    const rows = [
      {
        id: "1",
        sessionId: "session-1",
        sequenceOrder: 1,
        role: "user",
        agentName: null,
        content: "First brief",
        confidence: null,
        recommendedAction: null,
        summaryRationale: null,
        createdAt: now,
      },
      {
        id: "2",
        sessionId: "session-1",
        sequenceOrder: 2,
        role: "agent",
        agentName: "Athena",
        content: "Strategic response",
        confidence: "0.80",
        recommendedAction: "proceed",
        summaryRationale: "Launch in phases.",
        createdAt: now,
      },
      {
        id: "3",
        sessionId: "session-1",
        sequenceOrder: 3,
        role: "synthesis",
        agentName: "Metis",
        content: "Combined response",
        confidence: "0.84",
        recommendedAction: "proceed",
        summaryRationale: "The council agrees.",
        createdAt: now,
      },
      {
        id: "4",
        sessionId: "session-1",
        sequenceOrder: 4,
        role: "user",
        agentName: null,
        content: "Second brief",
        confidence: null,
        recommendedAction: null,
        summaryRationale: null,
        createdAt: new Date(now.getTime() + 60000),
      },
      {
        id: "5",
        sessionId: "session-1",
        sequenceOrder: 5,
        role: "agent",
        agentName: "Loki",
        content: "Critical response",
        confidence: "0.73",
        recommendedAction: "revise",
        summaryRationale: "There is more execution risk than expected.",
        createdAt: new Date(now.getTime() + 60000),
      },
      {
        id: "6",
        sessionId: "session-1",
        sequenceOrder: 6,
        role: "synthesis",
        agentName: "Metis",
        content: "Revise the rollout before launch.",
        confidence: "0.79",
        recommendedAction: "revise",
        summaryRationale: "The council changed its recommendation after new concerns.",
        createdAt: new Date(now.getTime() + 60000),
      },
    ] as const;

    const turns = reconstructCouncilTurns("session-1", rows as never);

    expect(turns).toHaveLength(2);
    expect(turns[0]?.userMessage).toBe("First brief");
    expect(turns[0]?.outputs[0]?.agentName).toBe("Athena");
    expect(turns[1]?.userMessage).toBe("Second brief");
    expect(turns[1]?.outputs[0]?.agentName).toBe("Loki");
    expect(turns[1]?.synthesis.recommendedAction).toBe("revise");
  });
});
