import { describe, expect, it } from "vitest";
import { reconstructCouncilTurns } from "@/lib/db";

const now = new Date("2026-04-16T20:00:00.000Z");

describe("METIS persistence helpers", () => {
  it("reconstructs chaired discussion transcripts within each persisted council turn", () => {
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
        agentName: "Metis",
        content: "Metis opens the meeting.",
        confidence: "0.81",
        recommendedAction: "proceed",
        summaryRationale: "The chair frames the debate.",
        createdAt: now,
      },
      {
        id: "3",
        sessionId: "session-1",
        sequenceOrder: 3,
        role: "agent",
        agentName: "Athena",
        content: "Athena proposes a strategy.",
        confidence: "0.80",
        recommendedAction: "proceed",
        summaryRationale: "A practical path is needed.",
        createdAt: now,
      },
      {
        id: "4",
        sessionId: "session-1",
        sequenceOrder: 4,
        role: "agent",
        agentName: "Loki",
        content: "Loki attacks the weakest assumption.",
        confidence: "0.73",
        recommendedAction: "revise",
        summaryRationale: "The plan is still brittle.",
        createdAt: now,
      },
      {
        id: "5",
        sessionId: "session-1",
        sequenceOrder: 5,
        role: "synthesis",
        agentName: "Metis",
        content: "Metis closes the first meeting.",
        confidence: "0.84",
        recommendedAction: "proceed",
        summaryRationale: "The council has enough signal to move.",
        createdAt: now,
      },
      {
        id: "6",
        sessionId: "session-1",
        sequenceOrder: 6,
        role: "user",
        agentName: null,
        content: "Second brief",
        confidence: null,
        recommendedAction: null,
        summaryRationale: null,
        createdAt: new Date(now.getTime() + 60000),
      },
      {
        id: "7",
        sessionId: "session-1",
        sequenceOrder: 7,
        role: "agent",
        agentName: "Metis",
        content: "Metis reframes the second problem.",
        confidence: "0.78",
        recommendedAction: "request_clarification",
        summaryRationale: "The opening needs a sharper problem statement.",
        createdAt: new Date(now.getTime() + 60000),
      },
      {
        id: "8",
        sessionId: "session-1",
        sequenceOrder: 8,
        role: "agent",
        agentName: "Argus",
        content: "Argus sets an evidence threshold.",
        confidence: "0.76",
        recommendedAction: "revise",
        summaryRationale: "The next step still needs proof.",
        createdAt: new Date(now.getTime() + 60000),
      },
      {
        id: "9",
        sessionId: "session-1",
        sequenceOrder: 9,
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
    expect(turns[0]?.discussion.map((message) => message.agentName)).toEqual([
      "Metis",
      "Athena",
      "Loki",
    ]);
    expect(turns[0]?.discussion[0]?.sequenceOrder).toBe(2);
    expect(turns[1]?.userMessage).toBe("Second brief");
    expect(turns[1]?.discussion[1]?.agentName).toBe("Argus");
    expect(turns[1]?.synthesis.sequenceOrder).toBe(9);
    expect(turns[1]?.synthesis.recommendedAction).toBe("revise");
  });
});
