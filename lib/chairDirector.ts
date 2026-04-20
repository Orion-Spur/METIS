import { z } from "zod";
import { ENV } from "@/lib/env";
import type {
  MetisAgentName,
  MetisCouncilLearning,
  MetisCouncilMessage,
} from "@/shared/metis";

// ---------- Schema ----------

const chairDirectiveSchema = z.object({
  action: z.enum(["call_specialist", "call_round", "deadlock", "synthesise"]),
  target: z.enum(["Athena", "Argus", "Loki"]).nullable().default(null),
  directive: z.string().min(10).max(400),
  rationale: z.string().min(10).max(400),
  memoryIntervention: z
    .object({
      learningId: z.number().int(),
      reason: z.string().min(5).max(300),
    })
    .nullable()
    .default(null),
});

export type ChairDirective = z.infer<typeof chairDirectiveSchema>;

// ---------- System prompt ----------

const DIRECTOR_SYSTEM_PROMPT = `You are Metis, chair of the METIS council. This is NOT a turn where you speak to the room. This is a turn where you decide what happens next in the live debate.

You have four possible moves:

- call_specialist: direct exactly one specialist (Athena, Argus, or Loki) to respond with a specific directive. Use when you want one voice, sharpened, on a specific point.
- call_round: bring all three specialists back in sequence with a shared directive. Use when the room needs another full pass.
- deadlock: formally declare the room cannot converge, and the reasons will be carried into the synthesis. Use rarely — only when no further round will produce new material.
- synthesise: close the meeting and produce the final synthesis. You may only choose this if the challenge round has completed (Loki has delivered at least one explicit challenge AND every specialist has spoken at least twice) and you judge the room is ready.

RULES

1. You cannot choose synthesise before the challenge round has completed. If you try, your decision will be rejected.
2. Prefer call_specialist over call_round when one targeted voice will unblock the room. Full rounds are expensive; use them when you need all angles.
3. Your directive to the specialist must be concrete. "Respond to Loki's objection about SDR baseline with a specific measurable threshold" is good. "Continue the discussion" is not.
4. If a relevant prior learning exists in memory, you may attach a memoryIntervention. Use this when a prior decision or principle from a past session is directly relevant to the current argument — the specialist will be told to address it by name. Use this AGGRESSIVELY when the room is relitigating something already decided.
5. Your rationale should explain WHY this move advances the room. One or two sentences.

OUTPUT FORMAT

Return ONLY valid JSON matching this exact shape, no prose, no markdown:

{
  "action": "call_specialist" | "call_round" | "deadlock" | "synthesise",
  "target": "Athena" | "Argus" | "Loki" | null,
  "directive": "The concrete instruction to the specialist (or to all specialists, for call_round). Required.",
  "rationale": "Why this move advances the room. Required.",
  "memoryIntervention": null | { "learningId": <id>, "reason": "why this prior learning must be addressed now" }
}

target must be set when action is call_specialist. target must be null for other actions.`;

// ---------- User prompt construction ----------

function formatTranscript(messages: MetisCouncilMessage[]): string {
  if (messages.length === 0) return "No discussion yet.";

  return messages
    .map(
      (m, i) =>
        `[${i + 1}] ${m.agentName}: ${m.content.split("\n").slice(0, 3).join(" ").slice(0, 600)}`
    )
    .join("\n\n");
}

function formatMemoryForChair(learnings: MetisCouncilLearning[]): string {
  if (learnings.length === 0) {
    return "Available prior memory: none retrieved.";
  }

  const lines = ["Available prior memory (learningId in brackets):"];
  for (const learning of learnings) {
    const conf = learning.confidence === "firm" ? "" : ` [${learning.confidence}]`;
    lines.push(`[${learning.id}] ${learning.kind}${conf}: ${learning.statement}`);
  }
  return lines.join("\n");
}

function formatRoundState(input: {
  openingRoundComplete: boolean;
  challengeRoundComplete: boolean;
  elapsedSeconds: number;
  timeoutSeconds: number;
  forceClosureReason: string | null;
}): string {
  const lines = [
    "Current round state:",
    `- Opening round complete: ${input.openingRoundComplete ? "yes" : "no"}`,
    `- Challenge round complete: ${input.challengeRoundComplete ? "yes" : "no (synthesise is not yet allowed)"}`,
    `- Elapsed time: ${input.elapsedSeconds}s of ${input.timeoutSeconds}s budget`,
  ];

  if (input.forceClosureReason) {
    lines.push(
      `- CLOSURE FORCED: ${input.forceClosureReason}. You must choose synthesise or deadlock now; further rounds will not be permitted.`
    );
  }

  if (input.elapsedSeconds > input.timeoutSeconds * 0.7) {
    lines.push(
      "- Time budget is running low. Prefer synthesise over further rounds unless the debate genuinely requires one more pass."
    );
  }

  return lines.join("\n");
}

// ---------- The director call ----------

type FetchLike = typeof fetch;

export async function decideNextMove(input: {
  brief: string;
  discussion: MetisCouncilMessage[];
  availableLearnings: MetisCouncilLearning[];
  openingRoundComplete: boolean;
  challengeRoundComplete: boolean;
  elapsedSeconds: number;
  timeoutSeconds: number;
  forceClosureReason: string | null;
  fetchImpl?: FetchLike;
  apiKey?: string;
  model?: string;
}): Promise<ChairDirective> {
  const apiKey = input.apiKey ?? ENV.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const userPrompt = [
    `Council brief from Orion:\n${input.brief}`,
    formatMemoryForChair(input.availableLearnings),
    formatRoundState({
      openingRoundComplete: input.openingRoundComplete,
      challengeRoundComplete: input.challengeRoundComplete,
      elapsedSeconds: input.elapsedSeconds,
      timeoutSeconds: input.timeoutSeconds,
      forceClosureReason: input.forceClosureReason,
    }),
    `Transcript so far:\n${formatTranscript(input.discussion)}`,
    "Decide the next move. Return JSON only.",
  ].join("\n\n");

  const body = {
    model: input.model ?? ENV.ANTHROPIC_MODEL,
    max_tokens: 600,
    system: DIRECTOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  };

  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Chair director call failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }> }
    | null;

  if (!data) {
    throw new Error("Chair director returned unparseable response.");
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  const jsonString = stripJsonFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(`Chair director returned non-JSON: ${text.slice(0, 300)}`);
  }

  const result = chairDirectiveSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Chair director output failed schema: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`
    );
  }

  return enforceDirectiveRules(result.data, {
    challengeRoundComplete: input.challengeRoundComplete,
    forceClosureReason: input.forceClosureReason,
  });
}

// ---------- Rule enforcement ----------

function enforceDirectiveRules(
  directive: ChairDirective,
  context: { challengeRoundComplete: boolean; forceClosureReason: string | null }
): ChairDirective {
  // Cannot synthesise before the challenge round is complete.
  if (directive.action === "synthesise" && !context.challengeRoundComplete) {
    return {
      ...directive,
      action: "call_round",
      target: null,
      rationale: `Director attempted to synthesise before challenge round complete; overridden to call_round. Original rationale: ${directive.rationale}`,
    };
  }

  // If closure has been forced, only synthesise or deadlock are valid.
  if (context.forceClosureReason && directive.action !== "synthesise" && directive.action !== "deadlock") {
    return {
      ...directive,
      action: "synthesise",
      target: null,
      rationale: `Closure forced (${context.forceClosureReason}); overriding to synthesise. Original rationale: ${directive.rationale}`,
    };
  }

  // Normalise target: must be null unless call_specialist.
  if (directive.action !== "call_specialist") {
    return { ...directive, target: null };
  }

  // call_specialist must have a target; default to Loki if missing
  // (Loki is the safest default — additional challenge rarely hurts).
  if (directive.action === "call_specialist" && !directive.target) {
    return { ...directive, target: "Loki" };
  }

  return directive;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
  }
  return trimmed;
}

// ---------- Convenience for determining specialist sequence in a round ----------

const ROUND_SEQUENCE: MetisAgentName[] = ["Athena", "Argus", "Loki"];

export function specialistsForRound(): MetisAgentName[] {
  return [...ROUND_SEQUENCE];
}
