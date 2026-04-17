import { ENV } from "@/lib/env";
import { getCompanyProfile } from "@/lib/db";
import type {
  MetisAgentName,
  MetisAgentOutput,
  MetisCouncilMessage,
  MetisCouncilTurn,
  MetisRecommendedAction,
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
    "You are Athena of the METIS council. Speak as a live participant in the room, not as a static persona or job title. Help the room find direction by clarifying the decision, sequencing choices, and turning ambiguity into a workable path. Engage the strongest prior arguments directly and push the discussion toward an actionable shape. Keep your intervention concise and land your point cleanly.",
  Argus:
    "You are Argus of the METIS council. Speak as a live participant in the room, not as a static persona or job title. Help the room test evidence, examine assumptions, quantify trade-offs, and expose missing information with precision. Challenge earlier claims directly and raise the standard of proof when the case is weak. Keep your intervention concise and evidentially sharp.",
  Loki:
    "You are Loki of the METIS council. Speak as a live participant in the room, not as a static persona or job title. Help the room stress-test its thinking by challenging weak logic, exposing execution risk, and preventing comfortable consensus. Attack the most fragile assumption on the table and force the debate to become more concrete. Your challenge is required before the chair can close the discussion, so do not soften the pressure.",
};

const chairPrompt =
  "You are Metis, chair of the METIS council. You are not only moderating the discussion; you are thinking inside it. Lead the meeting by defining the crux, reframing the problem when needed, redirecting the room, surfacing tensions, challenging weak assumptions yourself, and contributing original ideas that move the discussion forward. Keep the other participants fluid and unlabeled rather than reducing them to fixed roles. Before the closing synthesis, every position you offer is provisional: do not declare the decision settled until at least one full challenge round has happened and Loki has delivered explicit pushback.";

const synthesisPrompt =
  "You are Metis, chair of the METIS council. Produce the closing synthesis after the live discussion for Orion. Integrate the strongest arguments from the room, preserve the disagreement that still matters, state what the council is betting on, and end with one decisive recommended next action. Do not flatten real tensions merely to create agreement. You may converge only after Loki has issued the required challenge and the room has completed a full round of pressure and response.";

export type CouncilContextEntry = {
  role: "user" | "agent" | "synthesis";
  speakerName: MetisAgentName | "Orion";
  content: string;
  sequenceOrder: number;
  confidence?: number;
  recommendedAction?: MetisRecommendedAction;
  summaryRationale?: string;
};

type CouncilPlanStep = {
  kind: "discussion" | "synthesis";
  agentName: MetisAgentName;
  systemPrompt: string;
  stageDirection: string;
};

export type StreamedCouncilEvent = {
  kind: "discussion" | "synthesis";
  message: MetisCouncilMessage;
};

export type StreamCouncilTurnResult = {
  sessionId: string;
  userMessage: string;
  discussion: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage | null;
  createdAt: number;
  completed: boolean;
};

type StructuredCouncilPayload = Partial<MetisAgentOutput> & {
  position?: string;
  keyReasoning?: string[];
  challenge?: string;
};

type CouncilRoundState = {
  openingRoundComplete: boolean;
  challengeRoundComplete: boolean;
};

const POSITION_WORD_LIMIT = 45;
const REASONING_WORD_LIMIT = 18;
const CHALLENGE_WORD_LIMIT = 18;
const SUMMARY_WORD_LIMIT = 20;
const DISCUSSION_REASONING_LIMIT = 3;
const SYNTHESIS_REASONING_LIMIT = 4;

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

const councilPlan: CouncilPlanStep[] = [
  {
    kind: "discussion",
    agentName: "Metis",
    systemPrompt: chairPrompt,
    stageDirection:
      "Open the meeting. Restate the brief for Orion's decision, identify the central tension, contribute your own first framing of the problem, then assign the first pass: Athena should shape the path, Argus should test the assumptions, and Loki should attack the weak points. Keep your view provisional and do not close the discussion.",
  },
  {
    kind: "discussion",
    agentName: "Athena",
    systemPrompt: specialistPrompts.Athena,
    stageDirection:
      "Deliver the opening strategic position. Propose a practical path forward and acknowledge the central tension Metis named.",
  },
  {
    kind: "discussion",
    agentName: "Argus",
    systemPrompt: specialistPrompts.Argus,
    stageDirection:
      "Respond after reading the chair opening and Athena's position. Validate or challenge the assumptions, identify missing evidence, and sharpen the decision criteria.",
  },
  {
    kind: "discussion",
    agentName: "Loki",
    systemPrompt: specialistPrompts.Loki,
    stageDirection:
      "Respond after reading the prior speakers. Attack the weakest assumption on the table, expose the most serious execution risk, and make the debate more adversarial and concrete.",
  },
  {
    kind: "discussion",
    agentName: "Metis",
    systemPrompt: chairPrompt,
    stageDirection:
      "Chair the midpoint of the meeting. Name the most important unresolved tension created by the discussion so far, explicitly reference at least two specialists, add your own provisional view on what is emerging, and demand sharper closing positions. Do not synthesize the final answer yet, and do not act as if the decision is settled.",
  },
  {
    kind: "discussion",
    agentName: "Athena",
    systemPrompt: specialistPrompts.Athena,
    stageDirection:
      "Revise or defend your strategy after the midpoint intervention. Address at least one criticism by name and tighten the proposed path or sequencing.",
  },
  {
    kind: "discussion",
    agentName: "Argus",
    systemPrompt: specialistPrompts.Argus,
    stageDirection:
      "Assess whether the revised path now meets an acceptable evidence threshold. Address at least one prior speaker by name and state what still remains uncertain.",
  },
  {
    kind: "discussion",
    agentName: "Loki",
    systemPrompt: specialistPrompts.Loki,
    stageDirection:
      "Deliver the final required challenge before the chair synthesizes. Address at least one prior claim by name, identify the failure mode that still matters most, and make the strongest case against premature convergence.",
  },
  {
    kind: "synthesis",
    agentName: "Metis",
    systemPrompt: synthesisPrompt,
    stageDirection:
      "Close the meeting only after the required challenge round has completed. State the council's decision clearly, preserve the most useful disagreement, and end with one clear recommended next action for Orion.",
  },
];

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

function enforceCompactPayload(parsed: StructuredCouncilPayload, finalSynthesis = false): StructuredCouncilPayload {
  const reasoningLimit = finalSynthesis ? SYNTHESIS_REASONING_LIMIT : DISCUSSION_REASONING_LIMIT;
  const keyReasoningSource = Array.isArray(parsed.keyReasoning) && parsed.keyReasoning.length > 0
    ? parsed.keyReasoning
    : [parsed.summaryRationale ?? parsed.position ?? parsed.content ?? "No supporting reasoning returned."];

  return {
    ...parsed,
    position: truncateWords(parsed.position ?? parsed.content ?? "No position returned.", POSITION_WORD_LIMIT),
    keyReasoning: keyReasoningSource
      .map((item) => truncateWords(item, REASONING_WORD_LIMIT))
      .filter(Boolean)
      .slice(0, reasoningLimit),
    challenge: truncateWords(parsed.challenge ?? "No explicit challenge returned.", CHALLENGE_WORD_LIMIT),
    summaryRationale: truncateWords(parsed.summaryRationale ?? parsed.position ?? parsed.content ?? "No rationale returned.", SUMMARY_WORD_LIMIT),
  };
}

function formatStructuredContent(parsed: StructuredCouncilPayload) {
  const position = cleanInlineText(parsed.position ?? parsed.content ?? "No position returned.");
  const reasoning = Array.isArray(parsed.keyReasoning)
    ? parsed.keyReasoning.map((item) => cleanInlineText(item)).filter(Boolean)
    : [];
  const challenge = cleanInlineText(parsed.challenge ?? "No explicit challenge returned.");
  const reasoningLines = reasoning.length > 0
    ? reasoning.map((item) => `- ${item.replace(/^-+\s*/, "")}`)
    : [`- ${cleanInlineText(parsed.summaryRationale ?? "No supporting reasoning returned.")}`];

  return [
    "Position",
    position,
    "",
    "Key reasoning",
    ...reasoningLines,
    "",
    "Challenge",
    `- ${challenge.replace(/^-+\s*/, "")}`,
  ].join("\n");
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
  const sections = new Map<string, string[]>();
  let currentSection = "body";

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const normalizedHeading = line
      .replace(/^#+\s*/, "")
      .replace(/[:：]\s*$/, "")
      .trim()
      .toLowerCase();

    if (["position", "key reasoning", "challenge", "confidence", "recommended action", "summary rationale"].includes(normalizedHeading)) {
      currentSection = normalizedHeading;
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      continue;
    }

    const cleanedLine = line.replace(/^[-*•]\s*/, "");
    sections.set(currentSection, [...(sections.get(currentSection) ?? []), cleanedLine]);
  }

  const bodyLines = (sections.get("body") ?? []).map((line) => cleanInlineText(line)).filter(Boolean);
  const keyReasoning = (sections.get("key reasoning") ?? [])
    .map((line) => cleanInlineText(line))
    .filter(Boolean)
    .slice(0, 5);
  const position = cleanInlineText((sections.get("position") ?? []).join(" ") || bodyLines[0] || "No position returned.");
  const challenge = cleanInlineText(
    (sections.get("challenge") ?? []).join(" ") || bodyLines.at(-1) || "No explicit challenge returned.",
  );
  const confidenceText = cleanInlineText((sections.get("confidence") ?? []).join(" "));
  const recommendedActionText = cleanInlineText((sections.get("recommended action") ?? []).join(" ")).toLowerCase();
  const summaryRationale = cleanInlineText(
    (sections.get("summary rationale") ?? []).join(" ") || keyReasoning[0] || position,
  );
  const confidence = confidenceText.endsWith("%")
    ? Number(confidenceText.replace(/%$/, "")) / 100
    : Number(confidenceText || 0.5);
  const recommendedAction = recommendedActions.find((action) => recommendedActionText.includes(action));

  return {
    position,
    keyReasoning: keyReasoning.length > 0 ? keyReasoning : [summaryRationale],
    challenge,
    confidence: Number.isFinite(confidence) ? confidence : 0.5,
    recommendedAction: recommendedAction ?? "request_clarification",
    summaryRationale,
  };
}

function normaliseOutput(
  agentName: MetisAgentName,
  rawText: string,
  options?: { finalSynthesis?: boolean },
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

function buildStructuredPrompt(input: {
  agentName: MetisAgentName;
  brief: string;
  stageDirection: string;
  discussion: CouncilContextEntry[];
  companyContext?: string;
  finalSynthesis?: boolean;
}) {
  const priorAgentMessages = input.discussion.filter((entry) => entry.role !== "user").length;
  const engagementInstruction =
    priorAgentMessages > 0
      ? "Reference at least one earlier speaker by name and respond to their reasoning directly. If Orion has interjected, address the latest Orion intervention explicitly."
      : "Establish the first substantive position in the meeting rather than introducing yourself or claiming a fixed role.";

  const contentInstruction = input.finalSynthesis
    ? "You are producing the final close. Keep it compact, decisive, and under 110 words total across all visible sections. Preserve the most important disagreement instead of burying it."
    : "You are speaking live in the meeting. Keep the entire visible response under 90 words total and land the point fast.";
  const convergenceInstruction = input.finalSynthesis
    ? "You may converge now only because the required challenge round has occurred. Carry Loki's strongest surviving objection into the final challenge line."
    : input.agentName === "Metis"
      ? "Do not close the decision in this turn. Treat your position as provisional and explicitly keep the room open until the challenge round is complete."
      : input.agentName === "Loki"
        ? "Your challenge is mandatory. Name the sharpest weakness plainly so the room must deal with it before convergence."
        : "Keep your stance clear, concise, and responsive to the current tension rather than restating the whole case.";

  return [
    input.companyContext ?? "Company context: No company profile has been configured yet.",
    `Council brief:\n${input.brief}`,
    `Stage direction:\n${input.stageDirection}`,
    `Current discussion transcript:\n${formatTranscript(input.discussion)}`,
    engagementInstruction,
    contentInstruction,
    convergenceInstruction,
    "Council response format is mandatory.",
    "Return valid JSON only with exactly these fields: position, keyReasoning, challenge, confidence, recommendedAction, summaryRationale.",
    "Formatting rules:",
    "- position: 1 or 2 sentences, maximum 45 words.",
    "- keyReasoning: an array of 1 to 5 short bullet-ready strings, each under 18 words.",
    "- challenge: exactly 1 short bullet-worthy sentence naming the strongest disagreement or risk.",
    "- summaryRationale: exactly 1 short sentence under 20 words.",
    "Do not mention JSON, schemas, or formatting rules in the visible content.",
  ].join("\n\n");
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

async function callXai(system: string, prompt: string) {
  if (!ENV.XAI_API_KEY) {
    throw new Error("XAI_API_KEY is not configured.");
  }

  const response = await fetchWithRetry("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.XAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ENV.XAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`xAI request failed with ${response.status}`);
  }

  const data = await response.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

async function invokeAgent(
  agentName: MetisAgentName,
  system: string,
  prompt: string,
  options?: { finalSynthesis?: boolean },
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

  return normaliseOutput(agentName, await callXai(system, prompt), options);
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

export async function streamCouncilTurn(input: {
  sessionId: string;
  userMessage: string;
  history?: MetisCouncilTurn[];
  historyEntries?: CouncilContextEntry[];
  onEvent?: (event: StreamedCouncilEvent) => Promise<void> | void;
  shouldStop?: () => Promise<boolean> | boolean;
}): Promise<StreamCouncilTurnResult> {
  const createdAt = Date.now();
  const discussion: MetisCouncilMessage[] = [];
  let synthesis: MetisCouncilMessage | null = null;
  let contextSequence = input.historyEntries ?? flattenTurnsToContextEntries(input.history ?? []);
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

  for (const step of councilPlan) {
    if ((await input.shouldStop?.()) === true) {
      return {
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        discussion,
        synthesis,
        createdAt,
        completed: false,
      };
    }

    if (step.kind === "synthesis" && !hasRequiredChallengeRound(discussion)) {
      throw new Error("Metis cannot converge before the full challenge round has completed.");
    }

    const output = await invokeAgent(
      step.agentName,
      step.systemPrompt,
      buildStructuredPrompt({
        agentName: step.agentName,
        brief: input.userMessage,
        stageDirection: step.stageDirection,
        discussion: contextSequence,
        companyContext,
        finalSynthesis: step.kind === "synthesis",
      }),
      { finalSynthesis: step.kind === "synthesis" },
    );

    const message = asDiscussionMessage(output, discussion.length + (step.kind === "synthesis" ? 1 : 1));

    if (step.kind === "discussion") {
      discussion.push(message);
      contextSequence.push(toContextEntry(message, "agent", contextSequence.length + 1));
    } else {
      synthesis = message;
      contextSequence.push(toContextEntry(message, "synthesis", contextSequence.length + 1));
    }

    await input.onEvent?.({ kind: step.kind, message });
  }

  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    discussion,
    synthesis,
    createdAt,
    completed: true,
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
