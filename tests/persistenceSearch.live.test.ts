import { describe, expect, it } from "vitest";
import {
  appendCouncilMessage,
  findUserByIdentifier,
  listRelevantSessionInsights,
  refreshSessionInsight,
  searchSessionPreviews,
  startCouncilSessionTurn,
} from "@/lib/db";
import type { MetisCouncilMessage } from "@/shared/metis";

function buildMessage(partial: Partial<MetisCouncilMessage> & Pick<MetisCouncilMessage, "agentName" | "content">): MetisCouncilMessage {
  return {
    sequenceOrder: partial.sequenceOrder ?? 1,
    agentName: partial.agentName,
    content: partial.content,
    confidence: partial.confidence ?? 0.82,
    recommendedAction: partial.recommendedAction ?? "proceed",
    summaryRationale: partial.summaryRationale ?? "Focused evidence supports the next move.",
  };
}

describe("METIS persistence search and insight helpers", () => {
  it("refreshes a reusable session insight and makes the session searchable by transcript content", async () => {
    const user = await findUserByIdentifier("orion");
    expect(user?.id).toBeTypeOf("number");

    const token = `roadmap-proof-${Date.now()}`;
    const opener = `Evaluate the ${token} launch sequence and governance guardrails.`;

    const started = await startCouncilSessionTurn({
      userId: user!.id,
      username: user!.username ?? "orion",
      userMessage: opener,
    });

    await appendCouncilMessage({
      sessionId: started.sessionId,
      role: "agent",
      message: buildMessage({
        agentName: "Metis",
        content: `Metis opens the ${token} room and frames the decision.`,
        summaryRationale: "The room needs a narrow decision frame before evidence review.",
      }),
    });

    await appendCouncilMessage({
      sessionId: started.sessionId,
      role: "agent",
      message: buildMessage({
        agentName: "Argus",
        content: `Argus says the ${token} plan needs a smaller proving market and a measurable threshold.`,
        recommendedAction: "revise",
        summaryRationale: "The first market should be small enough to produce clean evidence.",
      }),
    });

    await appendCouncilMessage({
      sessionId: started.sessionId,
      role: "synthesis",
      message: buildMessage({
        agentName: "Metis",
        content: `Proceed with a constrained ${token} pilot after one governance owner is named and the proving threshold is explicit.`,
        recommendedAction: "proceed",
        summaryRationale: `Run the ${token} pilot in one narrow segment before broad rollout.`,
      }),
    });

    const refreshedInsight = await refreshSessionInsight({
      sessionId: started.sessionId,
      userId: user!.id,
    });

    expect(refreshedInsight?.sessionId).toBe(started.sessionId);
    expect(refreshedInsight?.insight).toContain(token);

    const searchableSessions = await searchSessionPreviews(user!.id, token);
    const matchingSession = searchableSessions.find((entry) => entry.sessionId === started.sessionId);
    expect(matchingSession).toBeTruthy();
    expect(matchingSession?.matchedText?.toLowerCase()).toContain(token);

    const relatedInsights = await listRelevantSessionInsights({
      userId: user!.id,
      query: token,
      excludeSessionId: "non-matching-session",
      limit: 5,
    });
    const matchingInsight = relatedInsights.find((entry) => entry.sessionId === started.sessionId);
    expect(matchingInsight).toBeTruthy();
    expect(matchingInsight?.title.toLowerCase()).toContain(token.split("-")[0]!);
  }, 30000);
});
