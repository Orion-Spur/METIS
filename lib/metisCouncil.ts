import { ENV } from "@/lib/env";
import { getCompanyProfile } from "@/lib/db";
import { decideNextMove, specialistsForRound } from "@/lib/chairDirector";
import { buildLearningsBlock } from "@/lib/learningPromptInjection";
import { shouldForceClosure } from "@/lib/noveltyDetector";
import type {
  MetisAgentName,
  MetisAgentOutput,
  MetisCouncilLearning,
  MetisCouncilMessage,
  MetisCouncilTurn,
  MetisMemoryIntervention,
  MetisRecommendedAction,
  MetisSessionInsight,
} from "@/shared/metis";

const recommendedActions = [
  "proceed",
  "revise",
  "defer",
  "escalate",
  "request_clarification",
] as const;

const specialistPrompts: Record<Exclude<MetisAgentName, "Metis">, string> = {
  Athena:
    "You are Athena of the METIS council. You think in sequencing and practical pathways — turning ambiguity into a workable direction. Write naturally, in your own voice. You can use paragraphs, sentences, or a short list of steps when sequencing genuinely calls for it — but do not force structure that isn't there. Engage prior speakers by name and respond to their reasoning directly. Be clear, be specific, and land the point. Keep your intervention tight — under 120 words in the visible content — and resist the urge to restate arguments already in the room.",
  Argus:
    "You are Argus of the METIS council. You are clinical and evidence-driven. You test claims, expose missing data, and prefer numbers or thresholds over general caution. Write naturally — sentences and paragraphs, not templated bullets. If you need to list specific numbers or criteria, do so, but only where precision actually helps. Engage prior speakers by name and challenge their reasoning on specifics. Be terse where you can, expansive only where quantification demands it. Keep your intervention under 120 words in the visible content.",
  Loki:
    "You are Loki of the METIS council. Your voice is sharp, acerbic, and short. You attack the weakest assumption, name the failure mode, and force the debate to become concrete. You write in short sentences. You do not soften. You do not use tidy bullet lists — the shape of your attack is the point. When you challenge a speaker, you name them. Your pressure is required before the chair can converge, so do not go quiet. Keep your intervention under 100 words in the visible content. Shorter is stronger.",
};

const chairOpeningPrompt =
  "You are Metis, chair of the METIS council. This is the opening of the meeting. Your voice is considered and analytical — you think in tensions, reframes, and crux points. Write naturally, in your own voice. Define the crux of the brief, name the central tension, and contribute your first framing. Your view is provisional at this stage — do not declare anything settled. Keep it tight, under 130 words, and avoid the 'pros and cons' template. Shape the room's thinking rather than surveying it.";

const chairSpeaksPrompt =
  "You are Metis, chair of the METIS council, intervening live in the room. You are speaking because you have something substantive to add that no specialist has surfaced — a reframe, a tension to name, a gap to press, or a challenge only the chair can credibly make. Write naturally, in your own voice. Engage prior speakers by name and respond to their reasoning directly. Your position is still provisional — do not declare the decision settled yet. Keep it under 130 words. Land the point.";

const synthesisPrompt =
  "You are Metis, chair of the METIS council. Produce the closing synthesis for Orion. Integrate the strongest arguments from the room, preserve the disagreement that still matters, state clearly what the council is betting on, and end with one decisive recommended next action. Write as a considered close, not a summary bullet list. Do not flatten real tensions merely to create agreement. Keep it under 160 words.";

export type CouncilContextEntry = {
  role: "user" | "agent" | "synthesis";
  speakerName: MetisAgentName | "Orion";
  content: string;
  sequenceOrder: number;
  confidence?: number;
  recommendedAction?: MetisRecommendedAction;
  summaryRationale?: string;
};

export type StreamedCouncilEvent = {
  kind: "discussion" | "synthesis" | "chair_directive";
  message?: MetisCouncilMessage;
  directive?: {
    action: "call_specialist" | "call_round" | "chair_speaks" | "deadlock" | "synthesise";
    target: MetisAgentName | null;
    directive: string;
    rationale: string;
  };
};

export type StreamCouncilTurnResult = {
  sessionId: string;
  userMessage: string;
  discussion: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage | null;
  createdAt: number;
  completed: boolean;
  deadlockReason?: string | null;
};

type StructuredCouncilPayload = Partial<MetisAgentOutput> & {
  // The old position/keyReasoning/challenge split is removed in Phase 2.2.
  // Content is now free-form prose. We keep the partials as optional for
  // backwards compatibility with any stored or in-flight data, but the
  // builder no longer emits them.
  position?: string;
  keyReasoning?: string[];
  challenge?: string;
};

type CouncilRoundState = {
  openingRoundComplete: boolean;
  challengeRoundComplete: boolean;
};

// Word budgets for the free-form content. Enforced by truncation on the
// server side so the agents can't run away with a 400-word monologue.
const DISCUSSION_CONTENT_WORD_LIMIT = 140; // specialists mid-debate
const SYNTHESIS_CONTENT_WORD_LIMIT = 180;  // closing synthesis
const SUMMARY_WORD_LIMIT = 22;              // machine-readable summaryRationale

// Hard upper bound on chair-directed moves. The chair has free rein within
// this ceiling. Set high enough that normal sessions never hit it; acts
// as a final safety net against runaway loops if everything else fails.
const MAX_CHAIR_MOVES = 30;

// Default soft timeout for the deliberation. The route can override.
const DEFAULT_TIMEOUT_SECONDS = 270;

function buildCompanyContextBlock(profile: Awaited<ReturnType<typeof getCompanyProfile>>) {
  if (!profile) {
    return "Company context: No company profile has been configured yet. Use only the live session details and avoid inventing business facts.";
  }

  return [
    "Company context:",
    `Name: ${profile.name}`,
    `Mission: ${profile.mission}`,
    `Products: ${profile.products}`,
    `Customers: ${profile.customers ?? "Not specified."}`,
    `Constraints: ${profile.constraints ?? "Not specified."}`,
    `Team size: ${profile.teamSize ?? "Not specified."}`,
    `Stage: ${profile.stage ?? "Not specified."}`,
    `Operating model: ${profile.operatingModel ?? "Not specified."}`,
    `Geography: ${profile.geography ?? "Not specified."}`,
  ].join("\n");
}

function cleanInlineText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWords(value: unknown, wordLimit: number) {
  const words = cleanInlineText(value).split(" ").filter(Boolean);
  if (words.length <= wordLimit) {
    return words.join(" ");
  }

  return `${words.slice(0, wordLimit).join(" ")}…`;
}

// Preserve paragraph breaks and list formatting while still capping total
// word count. Returns a normalised string that agents can keep their shape
// in: short paragraphs, occasional bullets, tight sentences.
// Exported for testing. Keep in sync with the internal signatures.
export {
  truncateContent as truncateContentForTest,
  enforceCompactPayload as enforceCompactPayloadForTest,
  formatStructuredContent as formatStructuredContentForTest,
};

// Preserve paragraph breaks and list formatting while still capping total
// word count. Returns a normalised string that agents can keep their shape
// in: short paragraphs, occasional bullets, tight sentences.
function truncateContent(value: unknown, wordLimit: number): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "No content returned.";
  }

  // Count words across the whole string, not per-line. If under the limit,
  // return untouched so we preserve newlines, bullets, and paragraph breaks.
  const allWords = raw.split(/\s+/).filter(Boolean);
  if (allWords.length <= wordLimit) {
    return raw;
  }

  // Over budget: walk token-by-token until we hit the limit, cutting
  // cleanly at a word boundary. Preserves newlines that fall within the
  // budget.
  let count = 0;
  const out: string[] = [];
  const tokens = raw.split(/(\s+)/); // keep whitespace tokens
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      out.push(tok);
      continue;
    }
    if (count >= wordLimit) break;
    out.push(tok);
    count += 1;
  }
  return `${out.join("").trimEnd()}…`;
}

function enforceCompactPayload(parsed: StructuredCouncilPayload, finalSynthesis = false): StructuredCouncilPayload {
  const contentLimit = finalSynthesis
    ? SYNTHESIS_CONTENT_WORD_LIMIT
    : DISCUSSION_CONTENT_WORD_LIMIT;

  const content = truncateContent(
    parsed.content ?? parsed.position ?? parsed.summaryRationale ?? "No content returned.",
    contentLimit,
  );

  const summaryRationale = truncateWords(
    parsed.summaryRationale ?? parsed.content ?? parsed.position ?? "No rationale returned.",
    SUMMARY_WORD_LIMIT,
  );

  return {
    ...parsed,
    content,
    summaryRationale,
  };
}

function formatStructuredContent(parsed: StructuredCouncilPayload): string {
  // Free-form content is used as-is. No re-shaping into bullet lists, no
  // "Position: X\n\n- bullet\n\n- bullet" template. Agents write in their
  // own voice and we respect it.
  const content = String(parsed.content ?? parsed.position ?? "No content returned.").trim();
  return content || "No content returned.";
}

export function getCouncilRoundState(discussion: Array<Pick<MetisCouncilMessage, "agentName">>): CouncilRoundState {
  const counts = discussion.reduce<Record<MetisAgentName, number>>(
    (accumulator, message) => {
      accumulator[message.agentName] += 1;
      return accumulator;
    },
    { Metis: 0, Athena: 0, Argus: 0, Loki: 0 },
  );

  return {
    openingRoundComplete: counts.Metis >= 1 && counts.Athena >= 1 && counts.Argus >= 1 && counts.Loki >= 1,
    challengeRoundComplete:
      counts.Metis >= 2 && counts.Athena >= 2 && counts.Argus >= 2 && counts.Loki >= 2,
  };
}

export function hasRequiredChallengeRound(discussion: Array<Pick<MetisCouncilMessage, "agentName">>) {
  return getCouncilRoundState(discussion).challengeRoundComplete;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const codeBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseStructuredFallback(rawText: string): StructuredCouncilPayload {
  // When the LLM fails to return valid JSON, we treat the entire text
  // response as the content. We attempt a best-effort extraction of
  // confidence and recommendedAction if the text happens to mention them,
  // but the core falls back to "use what the model said as the content."
  const text = rawText.trim();

  // Try to find a confidence number expressed as a percentage (e.g. "85%")
  // or as a decimal (e.g. "0.85"). Best-effort only.
  let confidence = 0.5;
  const pctMatch = text.match(/\b(\d{1,3})\s*%/);
  if (pctMatch) {
    const n = Number(pctMatch[1]) / 100;
    if (Number.isFinite(n) && n >= 0 && n <= 1) confidence = n;
  }

  // Try to find a recommended action word in the text.
  const lower = text.toLowerCase();
  const recommendedAction = recommendedActions.find((action) => lower.includes(action));

  // First sentence makes a reasonable fallback summary if nothing else.
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  const summaryRationale = cleanInlineText(firstSentence).slice(0, 240);

  return {
    content: text,
    confidence,
    recommendedAction: recommendedAction ?? "request_clarification",
    summaryRationale: summaryRationale || "No rationale returned.",
  };
}

function normaliseOutput(
  agentName: MetisAgentName,
  rawText: string,
  options?: { finalSynthesis?: boolean; memoryIntervention?: MetisMemoryIntervention | null },
): MetisAgentOutput {
  let parsed: StructuredCouncilPayload;

  try {
    parsed = JSON.parse(extractJson(rawText)) as StructuredCouncilPayload;
  } catch {
    parsed = parseStructuredFallback(rawText);
  }

  const compactParsed = enforceCompactPayload(parsed, options?.finalSynthesis === true);
  const confidence = Number(compactParsed.confidence ?? 0.5);
  const recommendedAction = recommendedActions.includes(
    compactParsed.recommendedAction as (typeof recommendedActions)[number],
  )
    ? (compactParsed.recommendedAction as MetisAgentOutput["recommendedAction"])
    : "request_clarification";

  return {
    agentName,
    content: formatStructuredContent(compactParsed),
    confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0.5)),
    recommendedAction,
    summaryRationale: cleanInlineText(compactParsed.summaryRationale ?? "No rationale returned."),
    memoryIntervention: options?.memoryIntervention ?? null,
  };
}

function formatTranscript(discussion: CouncilContextEntry[]) {
  if (discussion.length === 0) {
    return "No prior council discussion yet.";
  }

  return discussion
    .map((message) => {
      if (message.role === "user") {
        return `${message.sequenceOrder}. Orion\n${message.content}`;
      }

      return `${message.sequenceOrder}. ${message.speakerName} | confidence ${Math.round(
        (message.confidence ?? 0) * 100,
      )}% | action ${message.recommendedAction ?? "request_clarification"}\n${message.content}\nRationale: ${message.summaryRationale ?? "No rationale returned."}`;
    })
    .join("\n\n");
}

function findLearningById(
  learnings: MetisCouncilLearning[] | undefined,
  id: number | null | undefined
): MetisCouncilLearning | null {
  if (!learnings || !id) return null;
  return learnings.find((entry) => entry.id === id) ?? null;
}

function buildStructuredPrompt(input: {
  agentName: MetisAgentName;
  brief: string;
  stageDirection: string;
  discussion: CouncilContextEntry[];
  companyContext?: string;
  relatedInsights?: MetisSessionInsight[];
  relatedLearnings?: MetisCouncilLearning[];
  memoryIntervention?: {
    learning: MetisCouncilLearning;
    reason: string;
  } | null;
  finalSynthesis?: boolean;
}) {
  const priorAgentMessages = input.discussion.filter((entry) => entry.role !== "user").length;
  const recallIntent = /\b(agree|agreed|agreement|agreements|decide|decided|decision|decisions|summary|summarise|summarize|recap|recall|previous|previously|earlier|prior|previous session|prior session|earlier session|where we left off|what happened|what has been agreed|what did we agree|today(?:'s)? discussion|today(?:'s)? discussions|this discussion|this session)\b/i.test(
    input.brief,
  );
  const engagementInstruction =
    priorAgentMessages > 0
      ? "Reference at least one earlier speaker by name and respond to their reasoning directly. If Orion has interjected, address the latest Orion intervention explicitly."
      : "Establish the first substantive position in the meeting rather than introducing yourself or claiming a fixed role.";

  const hasLearnings = input.relatedLearnings && input.relatedLearnings.length > 0;
  const hasLegacyInsights = input.relatedInsights && input.relatedInsights.length > 0;
  const hasAnyMemory = hasLearnings || hasLegacyInsights;

  const recallInstruction = recallIntent
    ? priorAgentMessages > 0
      ? "Orion is asking for continuity. Summarize what this live session has actually established so far before reaching for older memory, and keep any cross-session recall clearly labeled as prior memory."
      : hasAnyMemory
        ? "Orion is asking for continuity in a fresh room. Retrieved prior-session memory is available, so you must use it directly instead of claiming no memory was retrieved. Open with a clearly labeled prior-memory statement, ground it in at least one retrieved item, and only then explain how it should shape the current decision."
        : "Orion is asking for continuity, but no earlier memory was retrieved. Be explicit about the lack of prior memory instead of pretending this fresh room has already decided something."
    : "If relevant prior memory exists, use it deliberately and label it as prior-session memory rather than current-room agreement.";

  const contentInstruction = input.finalSynthesis
    ? "You are producing the final close. Write a considered synthesis, not a bullet-list summary. Keep it under 180 words."
    : "You are speaking live in the meeting. Write in your own voice, naturally. Keep it tight and land the point. Do not restate arguments already in the room — advance them.";
  const convergenceInstruction = input.finalSynthesis
    ? "You may converge now. Carry Loki's strongest surviving objection into the close rather than burying it."
    : input.agentName === "Metis"
      ? "Do not close the decision in this turn. Treat your position as provisional."
      : input.agentName === "Loki"
        ? "Your challenge is mandatory. Name the sharpest weakness plainly so the room must deal with it before convergence."
        : "Keep your stance clear, concise, and responsive to the current tension rather than restating the whole case.";

  const memoryBlock = hasLearnings
    ? buildLearningsBlock(input.relatedLearnings)
    : hasLegacyInsights
      ? [
          "Prior council memory (legacy):",
          ...(input.relatedInsights ?? []).map(
            (entry, index) =>
              `${index + 1}. ${entry.title} — ${entry.insight}${entry.rationale ? ` | Rationale: ${entry.rationale}` : ""}`,
          ),
        ].join("\n")
      : "Prior council memory: None retrieved for this brief. Do not invent prior outcomes.";

  const memoryInterventionBlock = input.memoryIntervention
    ? [
        "MEMORY INTERVENTION FROM THE CHAIR:",
        `The chair has invoked a prior learning that you must address directly in this turn.`,
        `Prior learning: ${input.memoryIntervention.learning.kind} [${input.memoryIntervention.learning.confidence}] — "${input.memoryIntervention.learning.statement}"`,
        `Why the chair surfaced it now: ${input.memoryIntervention.reason}`,
        `Open your response by naming this prior learning explicitly. Either apply it, respectfully contest it with new evidence, or explain why the current situation genuinely differs. Do not ignore it.`,
      ].join("\n")
    : "";

  const parts = [
    input.companyContext ?? "Company context: No company profile has been configured yet.",
    memoryBlock,
  ];

  if (memoryInterventionBlock) {
    parts.push(memoryInterventionBlock);
  }

  const recallOpener =
    recallIntent && !priorAgentMessages && hasAnyMemory
      ? "Because Orion is asking about prior memory, open your content with 'Prior memory:' and summarise at least one retrieved earlier-session learning before giving the current-room implication."
      : "";

  parts.push(
    `Council brief:\n${input.brief}`,
    `Stage direction:\n${input.stageDirection}`,
    `Current discussion transcript:\n${formatTranscript(input.discussion)}`,
    engagementInstruction,
    recallInstruction,
    contentInstruction,
    convergenceInstruction,
  );

  if (recallOpener) {
    parts.push(recallOpener);
  }

  parts.push(
    "Response format:",
    `Return ONLY valid JSON with these four fields and no others: { "content": <string>, "confidence": <number 0-1>, "recommendedAction": <one of: ${recommendedActions.join(
      ", ",
    )}>, "summaryRationale": <one short sentence under 22 words> }`,
    "The content field is free-form prose. Write in your own voice. You may use short paragraphs, occasional bullets where they genuinely help, or tight sentences — whichever serves your point. Do not force a 'position + bullets + challenge' template. Do not add section headers like 'Position:' or 'Key Reasoning:'.",
    input.finalSynthesis
      ? "Target length for content: under 180 words."
      : "Target length for content: under 140 words. Shorter is usually stronger.",
    "Do not mention JSON, schemas, or formatting rules inside the content.",
  );

  return parts.join("\n\n");
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }

  throw lastError;
}

async function callAnthropic(system: string, prompt: string) {
  if (!ENV.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ENV.ANTHROPIC_MODEL,
      system,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with ${response.status}`);
  }

  const data = await response.json();
  return String(data.content?.[0]?.text ?? "");
}

async function callAzure(system: string, prompt: string) {
  if (!ENV.AZUREGPT54_API_KEY || !ENV.AZUREGPT54_ENDPOINT || !ENV.AZUREGPT54_DEPLOYMENT) {
    throw new Error("Azure GPT configuration is incomplete.");
  }

  const url = `${ENV.AZUREGPT54_ENDPOINT.replace(/\/$/, "")}/openai/deployments/${ENV.AZUREGPT54_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": ENV.AZUREGPT54_API_KEY,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Azure GPT request failed with ${response.status}`);
  }

  const data = await response.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

async function callGemini(system: string, prompt: string) {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${system}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}`);
  }

  const data = await response.json();
  return String(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
}

async function callAzureGrok(system: string, prompt: string) {
  if (!ENV.AZUREGROK42_API_KEY || !ENV.AZUREGROK42_ENDPOINT || !ENV.AZUREGROK42_DEPLOYMENT) {
    throw new Error("Azure Grok configuration is incomplete.");
  }

  const url = `${ENV.AZUREGROK42_ENDPOINT.replace(/\/$/, "")}/chat/completions`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": ENV.AZUREGROK42_API_KEY,
    },
    body: JSON.stringify({
      model: ENV.AZUREGROK42_DEPLOYMENT ?? ENV.AZUREGROK42_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Azure Grok request failed with ${response.status}`);
  }

  const data = await response.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

async function invokeAgent(
  agentName: MetisAgentName,
  system: string,
  prompt: string,
  options?: { finalSynthesis?: boolean; memoryIntervention?: MetisMemoryIntervention | null },
) {
  if (agentName === "Metis") {
    return normaliseOutput(agentName, await callAnthropic(system, prompt), options);
  }
  if (agentName === "Athena") {
    return normaliseOutput(agentName, await callAzure(system, prompt), options);
  }
  if (agentName === "Argus") {
    return normaliseOutput(agentName, await callGemini(system, prompt), options);
  }

  return normaliseOutput(agentName, await callAzureGrok(system, prompt), options);
}

function asDiscussionMessage(output: MetisAgentOutput, sequenceOrder: number): MetisCouncilMessage {
  return {
    ...output,
    sequenceOrder,
  };
}

function toContextEntry(
  message: MetisCouncilMessage,
  role: "agent" | "synthesis",
  sequenceOrder: number,
): CouncilContextEntry {
  return {
    role,
    speakerName: message.agentName,
    content: message.content,
    sequenceOrder,
    confidence: message.confidence,
    recommendedAction: message.recommendedAction,
    summaryRationale: message.summaryRationale,
  };
}

export function flattenTurnsToContextEntries(turns: MetisCouncilTurn[]): CouncilContextEntry[] {
  let sequenceOrder = 0;

  return turns.flatMap((turn) => {
    const entries: CouncilContextEntry[] = [
      {
        role: "user",
        speakerName: "Orion",
        content: turn.userMessage,
        sequenceOrder: ++sequenceOrder,
      },
    ];

    for (const message of turn.discussion) {
      entries.push(toContextEntry(message, "agent", ++sequenceOrder));
    }

    entries.push(toContextEntry(turn.synthesis, "synthesis", ++sequenceOrder));
    return entries;
  });
}

// ---------- The dynamic council loop ----------

async function runSpecialistTurn(input: {
  agentName: Exclude<MetisAgentName, "Metis">;
  directive: string;
  brief: string;
  contextSequence: CouncilContextEntry[];
  companyContext: string;
  relatedInsights?: MetisSessionInsight[];
  relatedLearnings?: MetisCouncilLearning[];
  memoryIntervention?: { learning: MetisCouncilLearning; reason: string } | null;
  discussion: MetisCouncilMessage[];
}): Promise<MetisCouncilMessage> {
  const output = await invokeAgent(
    input.agentName,
    specialistPrompts[input.agentName],
    buildStructuredPrompt({
      agentName: input.agentName,
      brief: input.brief,
      stageDirection: input.directive,
      discussion: input.contextSequence,
      companyContext: input.companyContext,
      relatedInsights: input.relatedInsights,
      relatedLearnings: input.relatedLearnings,
      memoryIntervention: input.memoryIntervention,
      finalSynthesis: false,
    }),
    {
      finalSynthesis: false,
      memoryIntervention: input.memoryIntervention
        ? { learningId: input.memoryIntervention.learning.id, reason: input.memoryIntervention.reason }
        : null,
    },
  );
  return asDiscussionMessage(output, input.discussion.length + 1);
}

export async function streamCouncilTurn(input: {
  sessionId: string;
  userMessage: string;
  history?: MetisCouncilTurn[];
  historyEntries?: CouncilContextEntry[];
  relatedInsights?: MetisSessionInsight[];
  relatedLearnings?: MetisCouncilLearning[];
  onEvent?: (event: StreamedCouncilEvent) => Promise<void> | void;
  shouldStop?: () => Promise<boolean> | boolean;
  timeoutSeconds?: number;
}): Promise<StreamCouncilTurnResult> {
  const createdAt = Date.now();
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const discussion: MetisCouncilMessage[] = [];
  let synthesis: MetisCouncilMessage | null = null;
  let deadlockReason: string | null = null;

  let contextSequence: CouncilContextEntry[] = input.historyEntries ?? flattenTurnsToContextEntries(input.history ?? []);
  const companyContext = buildCompanyContextBlock(await getCompanyProfile());

  contextSequence = [
    ...contextSequence,
    {
      role: "user",
      speakerName: "Orion",
      content: input.userMessage,
      sequenceOrder: contextSequence.length + 1,
    },
  ];

  const pushAgentMessage = async (message: MetisCouncilMessage, kind: "discussion" | "synthesis") => {
    if (kind === "discussion") {
      discussion.push(message);
    } else {
      synthesis = message;
    }
    contextSequence.push(toContextEntry(message, kind === "discussion" ? "agent" : "synthesis", contextSequence.length + 1));
    await input.onEvent?.({ kind, message });
  };

  // ----- Step 1: chair opening -----
  if ((await input.shouldStop?.()) === true) {
    return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false };
  }

  const openingDirective =
    "Open the meeting. Define the crux of the brief, name the central tension, and contribute your first framing. Do not close the discussion.";

  const opening = await invokeAgent(
    "Metis",
    chairOpeningPrompt,
    buildStructuredPrompt({
      agentName: "Metis",
      brief: input.userMessage,
      stageDirection: openingDirective,
      discussion: contextSequence,
      companyContext,
      relatedInsights: input.relatedInsights,
      relatedLearnings: input.relatedLearnings,
      finalSynthesis: false,
    }),
    { finalSynthesis: false },
  );
  await pushAgentMessage(asDiscussionMessage(opening, discussion.length + 1), "discussion");

  // ----- Step 2: initial opening round of specialists -----
  for (const agentName of specialistsForRound()) {
    if ((await input.shouldStop?.()) === true) {
      return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false };
    }

    const message = await runSpecialistTurn({
      agentName,
      directive:
        agentName === "Athena"
          ? "Deliver the opening strategic position. Propose a practical path forward and acknowledge the tension Metis named."
          : agentName === "Argus"
            ? "Validate or challenge the assumptions in Athena's position, identify missing evidence, and sharpen the decision criteria."
            : "Attack the weakest assumption on the table, expose the most serious execution risk, and make the debate more adversarial and concrete.",
      brief: input.userMessage,
      contextSequence,
      companyContext,
      relatedInsights: input.relatedInsights,
      relatedLearnings: input.relatedLearnings,
      discussion,
    });
    await pushAgentMessage(message, "discussion");
  }

  // ----- Step 3: dynamic chair loop -----
  for (let move = 0; move < MAX_CHAIR_MOVES; move += 1) {
    if ((await input.shouldStop?.()) === true) {
      return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false, deadlockReason };
    }

    const elapsedSeconds = Math.floor((Date.now() - createdAt) / 1000);
    const { openingRoundComplete, challengeRoundComplete } = getCouncilRoundState(discussion);
    const closure = shouldForceClosure(discussion, specialistsForRound().length);
    // Time-based forced closure takes precedence when we're deep into the budget.
    const timeExhausted = elapsedSeconds > timeoutSeconds * 0.85;
    const forceClosureReason = closure.force
      ? closure.reason
      : timeExhausted
        ? `time budget ${elapsedSeconds}s of ${timeoutSeconds}s nearly exhausted`
        : null;

    let directive;
    try {
      directive = await decideNextMove({
        brief: input.userMessage,
        discussion,
        availableLearnings: input.relatedLearnings ?? [],
        openingRoundComplete,
        challengeRoundComplete,
        elapsedSeconds,
        timeoutSeconds,
        forceClosureReason,
      });
    } catch (error) {
      // Director calls can fail for a few reasons: schema rejection, rate
      // limit, transient network error. None of these should kill the
      // session. Fall back to a safe deterministic choice that keeps the
      // debate moving and eventually produces a synthesis.
      console.warn(
        "[streamCouncilTurn] chair director call failed, falling back",
        error instanceof Error ? error.message : error,
      );
      const errorMessage = error instanceof Error ? error.message : "director error";

      if (challengeRoundComplete) {
        // Challenge round is done; safest move is to synthesise.
        directive = {
          action: "synthesise" as const,
          target: null,
          directive: "Director call failed after challenge round completed; synthesising from current state.",
          rationale: `Fallback after director error: ${errorMessage}`,
          memoryIntervention: null,
        };
      } else if (openingRoundComplete) {
        // Opening round done, challenge round not yet. Push a call_round to
        // complete the challenge round, which will then unlock synthesis.
        directive = {
          action: "call_round" as const,
          target: null,
          directive:
            "Challenge round required. Each specialist: address the weakest assumption on the table, name one concrete risk, and respond to at least one prior speaker by name.",
          rationale: `Fallback after director error: ${errorMessage}. Driving debate to challenge-round completion.`,
          memoryIntervention: null,
        };
      } else {
        // Shouldn't reach here — opening round is produced deterministically
        // before the loop — but defensively, also recover.
        directive = {
          action: "call_round" as const,
          target: null,
          directive:
            "Deliver the opening positions. Each specialist: state a position on the brief, name the central tension, and acknowledge what is uncertain.",
          rationale: `Fallback after director error: ${errorMessage}. Driving debate to opening-round completion.`,
          memoryIntervention: null,
        };
      }
    }

    await input.onEvent?.({
      kind: "chair_directive",
      directive: {
        action: directive.action,
        target: directive.target,
        directive: directive.directive,
        rationale: directive.rationale,
      },
    });

    if (directive.action === "deadlock") {
      deadlockReason = directive.rationale;
      break;
    }

    if (directive.action === "synthesise") {
      // Enforce the challenge round gate.
      if (!challengeRoundComplete) {
        // Director should not have returned this, but the rule guard already
        // rewrites to call_round — defensive fallback in case we got here.
        directive = { ...directive, action: "call_round", target: null };
      } else {
        break;
      }
    }

    // Resolve memory intervention against the learnings we actually have.
    const interventionLearning = findLearningById(
      input.relatedLearnings,
      directive.memoryIntervention?.learningId,
    );
    const memoryIntervention =
      interventionLearning && directive.memoryIntervention
        ? { learning: interventionLearning, reason: directive.memoryIntervention.reason }
        : null;

    if (directive.action === "chair_speaks") {
      if ((await input.shouldStop?.()) === true) {
        return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false, deadlockReason };
      }
      // Metis speaks mid-debate. Uses the full Anthropic model (Opus), not
      // the cheaper director model, because this is a substantive turn.
      const chairOutput = await invokeAgent(
        "Metis",
        chairSpeaksPrompt,
        buildStructuredPrompt({
          agentName: "Metis",
          brief: input.userMessage,
          stageDirection: directive.directive,
          discussion: contextSequence,
          companyContext,
          relatedInsights: input.relatedInsights,
          relatedLearnings: input.relatedLearnings,
          memoryIntervention,
          finalSynthesis: false,
        }),
        {
          finalSynthesis: false,
          memoryIntervention: memoryIntervention
            ? { learningId: memoryIntervention.learning.id, reason: memoryIntervention.reason }
            : null,
        },
      );
      const chairMessage = asDiscussionMessage(chairOutput, discussion.length + 1);
      await pushAgentMessage(chairMessage, "discussion");
      continue;
    }

    if (directive.action === "call_specialist" && directive.target) {
      if ((await input.shouldStop?.()) === true) {
        return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false, deadlockReason };
      }
      const message = await runSpecialistTurn({
        agentName: directive.target,
        directive: directive.directive,
        brief: input.userMessage,
        contextSequence,
        companyContext,
        relatedInsights: input.relatedInsights,
        relatedLearnings: input.relatedLearnings,
        memoryIntervention,
        discussion,
      });
      await pushAgentMessage(message, "discussion");
      continue;
    }

    if (directive.action === "call_round") {
      for (const agentName of specialistsForRound()) {
        if ((await input.shouldStop?.()) === true) {
          return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false, deadlockReason };
        }
        const message = await runSpecialistTurn({
          agentName,
          directive: directive.directive,
          brief: input.userMessage,
          contextSequence,
          companyContext,
          relatedInsights: input.relatedInsights,
          relatedLearnings: input.relatedLearnings,
          // The intervention, if any, is addressed only by the first speaker
          // of the round. Otherwise all three pile on the same learning,
          // which is repetitive.
          memoryIntervention: agentName === "Athena" ? memoryIntervention : null,
          discussion,
        });
        await pushAgentMessage(message, "discussion");
      }
      continue;
    }
  }

  // ----- Step 4: synthesis -----
  // We arrive here either because the chair directed synthesise, declared
  // deadlock, or because MAX_CHAIR_MOVES was reached. In all cases we must
  // produce a final synthesis message to close the session cleanly.
  if (!synthesis) {
    if ((await input.shouldStop?.()) === true) {
      return { sessionId: input.sessionId, userMessage: input.userMessage, discussion, synthesis, createdAt, completed: false, deadlockReason };
    }

    const synthesisDirective = deadlockReason
      ? `The council did not converge. The chair declared deadlock with this reason: ${deadlockReason}. Produce a synthesis that states the council's inability to land the decision, summarises the strongest competing positions, and recommends one concrete next step for Orion (usually: gather a specific piece of missing evidence before bringing the brief back).`
      : "Close the meeting. Integrate the strongest arguments, preserve the disagreement that still matters, state what the council is betting on, and end with one decisive recommended next action for Orion.";

    const output = await invokeAgent(
      "Metis",
      synthesisPrompt,
      buildStructuredPrompt({
        agentName: "Metis",
        brief: input.userMessage,
        stageDirection: synthesisDirective,
        discussion: contextSequence,
        companyContext,
        relatedInsights: input.relatedInsights,
        relatedLearnings: input.relatedLearnings,
        finalSynthesis: true,
      }),
      { finalSynthesis: true },
    );
    await pushAgentMessage(asDiscussionMessage(output, discussion.length + 1), "synthesis");
  }

  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    discussion,
    synthesis,
    createdAt,
    completed: true,
    deadlockReason,
  };
}

export async function orchestrateCouncilTurn(input: {
  sessionId: string;
  userMessage: string;
  history?: MetisCouncilTurn[];
}): Promise<MetisCouncilTurn> {
  const result = await streamCouncilTurn({
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    history: input.history,
  });

  if (!result.synthesis) {
    throw new Error("The METIS council turn was interrupted before synthesis.");
  }

  return {
    sessionId: result.sessionId,
    userMessage: result.userMessage,
    discussion: result.discussion,
    synthesis: result.synthesis,
    createdAt: result.createdAt,
  };
}
