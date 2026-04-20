import { z } from "zod";
import { ENV } from "@/lib/env";
import type {
  MetisAgentName,
  MetisCouncilLearning,
  MetisCouncilMessage,
} from "@/shared/metis";

// ---------- Schema ----------

const chairDirectiveSchema = z.object({
  action: z.enum([
    "call_specialist",
    "call_round",
    "chair_speaks",
    "deadlock",
    "synthesise",
  ]),
  // Target is only meaningful for call_specialist. For chair_speaks we
  // implicitly target Metis. For all other actions target should be null.
  target: z.enum(["Athena", "Argus", "Loki"]).nullable().default(null),
  // Widened from 400 to 2000 — real Opus output in a rich debate easily
  // runs past 400 characters, and we truncate rather than reject.
  directive: z.string().min(10).max(2000),
  rationale: z.string().min(10).max(2000),
  memoryIntervention: z
    .object({
      learningId: z.number().int(),
      reason: z.string().min(5).max(1000),
    })
    .nullable()
    .default(null),
});

export type ChairDirective = z.infer<typeof chairDirectiveSchema>;

// ---------- System prompt ----------

const DIRECTOR_SYSTEM_PROMPT = `You are Metis, chair of the METIS council, deciding what happens next in a live debate. You are not speaking to the room on this turn. You are choosing the next move.

You are the most capable thinker in the room. Your role is to LEAD the thinking, not just route between others. If the room is missing a frame, an angle, or a sharper formulation that only you can provide, you should speak yourself rather than delegate. Specialists contribute their specialties; you contribute your judgement, synthesis, and willingness to reframe. A chair who only delegates is a chair who has abdicated.

You have FIVE possible moves:

- chair_speaks: you speak to the room yourself on your next turn. Use this when you have a reframe, a tension to name, a gap no specialist is seeing, a challenge only the chair can credibly make, or when you need to steer the debate before closing it. Speak at least as often as you delegate when you have something substantive to add.
- call_specialist: direct Athena, Argus, or Loki to respond with a specific directive. Use when one targeted voice will unblock the room.
- call_round: bring all three specialists back in sequence with a shared directive. Use when the room needs another full pass.
- deadlock: formally declare the room cannot converge. Use rarely — only when no further round will produce new material.
- synthesise: close the meeting and produce the final synthesis. You may only choose this if the challenge round has completed (every specialist has spoken at least twice AND Loki has delivered explicit challenge) and you judge the room is ready.

RULES

1. You cannot choose synthesise before the challenge round has completed. If you try, your decision will be rejected and replaced with call_round.
2. Do NOT be deferential. When you have a view, speak. When a specialist has made a gap-laden argument, do not quietly move on — either speak yourself to name the gap, or direct a specialist to address it.
3. When memory is relevant, use it AGGRESSIVELY. If a retrieved prior learning bears on the current argument — especially a firm decision the room is relitigating — attach a memoryIntervention and direct a specialist to address it by name. Use memory as authority, not just reference.
4. Your directive must be concrete and specific. "Respond to Loki's claim about enterprise perception with a price-point benchmark" is good. "Continue the discussion" is not.
5. Your rationale should explain why this move advances the room. One or two sentences.

BIAS TOWARD SPEAKING. If you are uncertain whether to speak or delegate, and you have something to add, speak. The council is not best served by a silent chair.

OUTPUT FORMAT

Return ONLY valid JSON matching this exact shape, no prose, no markdown:

{
  "action": "chair_speaks" | "call_specialist" | "call_round" | "deadlock" | "synthesise",
  "target": "Athena" | "Argus" | "Loki" | null,
  "directive": "Concrete instruction (to the specialist if call_specialist, to yourself as a brief for your next spoken turn if chair_speaks, to all specialists for call_round). Required for all actions.",
  "rationale": "Why this move advances the room. Required.",
  "memoryIntervention": null | { "learningId": <id>, "reason": "why this prior learning must be addressed now" }
}

target must be set when action is call_specialist. target must be null for chair_speaks and all other actions.`;

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

function countChairTurnsSinceLastChair(discussion: MetisCouncilMessage[]): {
  specialistsSinceChair: number;
  chairTurnsTotal: number;
} {
  let specialistsSinceChair = 0;
  let chairTurnsTotal = 0;
  for (let i = discussion.length - 1; i >= 0; i -= 1) {
    if (discussion[i].agentName === "Metis") {
      chairTurnsTotal += 1;
      if (specialistsSinceChair === 0) {
        // We're scanning backwards — if we hit Metis before any specialists,
        // reset the counter and keep counting total chair turns.
        continue;
      }
      break;
    }
    specialistsSinceChair += 1;
  }
  // Count total chair turns overall (second pass).
  chairTurnsTotal = discussion.filter((m) => m.agentName === "Metis").length;
  return { specialistsSinceChair, chairTurnsTotal };
}

function formatRoundState(input: {
  openingRoundComplete: boolean;
  challengeRoundComplete: boolean;
  elapsedSeconds: number;
  timeoutSeconds: number;
  forceClosureReason: string | null;
  specialistsSinceChair: number;
  chairTurnsTotal: number;
}): string {
  const lines = [
    "Current round state:",
    `- Opening round complete: ${input.openingRoundComplete ? "yes" : "no"}`,
    `- Challenge round complete: ${input.challengeRoundComplete ? "yes" : "no (synthesise is not yet allowed)"}`,
    `- Elapsed time: ${input.elapsedSeconds}s of ${input.timeoutSeconds}s budget`,
    `- Chair (Metis) turns so far: ${input.chairTurnsTotal}`,
    `- Specialists spoken since last chair turn: ${input.specialistsSinceChair}`,
  ];

  if (input.specialistsSinceChair >= 3) {
    lines.push(
      "- CHAIR PROMPT: three or more specialists have spoken since your last turn. Consider whether you should speak now (chair_speaks) rather than delegate another turn. If you have a reframe, tension to name, or gap to surface, do it."
    );
  }

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
  const { specialistsSinceChair, chairTurnsTotal } = countChairTurnsSinceLastChair(
    input.discussion
  );

  const userPrompt = [
    `Council brief from Orion:\n${input.brief}`,
    formatMemoryForChair(input.availableLearnings),
    formatRoundState({
      openingRoundComplete: input.openingRoundComplete,
      challengeRoundComplete: input.challengeRoundComplete,
      elapsedSeconds: input.elapsedSeconds,
      timeoutSeconds: input.timeoutSeconds,
      forceClosureReason: input.forceClosureReason,
      specialistsSinceChair,
      chairTurnsTotal,
    }),
    `Transcript so far:\n${formatTranscript(input.discussion)}`,
    "Decide the next move. Return JSON only.",
  ].join("\n\n");

  const body = {
    model: input.model ?? ENV.METIS_DIRECTOR_MODEL,
    max_tokens: 800,
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

  // call_specialist must have a target; default to Loki if missing.
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

type SpecialistName = Exclude<MetisAgentName, "Metis">;

const ROUND_SEQUENCE: SpecialistName[] = ["Athena", "Argus", "Loki"];

export function specialistsForRound(): SpecialistName[] {
  return [...ROUND_SEQUENCE];
}
