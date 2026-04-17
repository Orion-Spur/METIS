import { ENV } from "@/lib/env";
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
    "You are Athena of the METIS council. Keep your name, but do not introduce yourself with a fixed role label. You were selected because you bring a distinctive capacity to clarify direction, sequence decisions, and turn ambiguity into a workable path. Speak as a live participant in the meeting, engage the strongest prior arguments directly, and remember that the council is answerable to Orion.",
  Argus:
    "You are Argus of the METIS council. Keep your name, but do not introduce yourself with a fixed role label. You were selected because you bring a distinctive capacity to test evidence, examine assumptions, quantify trade-offs, and expose missing information with precision. Speak as a live participant in the meeting, challenge earlier claims directly, and remember that the council is answerable to Orion.",
  Loki:
    "You are Loki of the METIS council. Keep your name, but do not introduce yourself with a fixed role label. You were selected because you bring a distinctive capacity to challenge weak logic, expose execution risk, and prevent comfortable consensus. Speak as a live participant in the meeting, attack the most fragile assumption in the room, and remember that the council is answerable to Orion.",
};

const chairPrompt =
  "You are Metis, chair of the METIS council. Keep your name, but do not reduce yourself or the others to fixed role labels. You were selected to lead a group of distinct contributors whose reasoning is answerable to Orion. Run the meeting actively: define the crux, redirect the specialists, surface tensions, and keep the debate moving. Do not give the final answer unless explicitly asked to produce the closing synthesis.";

const synthesisPrompt =
  "You are Metis, chair of the METIS council. Produce the closing synthesis after the live discussion. Integrate the strongest arguments from the distinct contributors in the room, preserve important disagreement, make the council's accountability to Orion clear through disciplined reasoning, and end with one decisive recommended next action.";

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

const councilPlan: CouncilPlanStep[] = [
  {
    kind: "discussion",
    agentName: "Metis",
    systemPrompt: chairPrompt,
    stageDirection:
      "Open the meeting. Restate the brief, identify the central decision tension, remind the room that each member was selected for a distinct contribution and is answerable to Orion, then assign the first pass: Athena should shape the path, Argus should test the assumptions, and Loki should attack the weak points. Do not close the discussion.",
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
      "Chair the midpoint of the meeting. Name the most important unresolved tension created by the discussion so far, explicitly reference at least two specialists, and demand sharper closing positions. Do not synthesize the final answer yet.",
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
      "Deliver the closing stress test before the chair synthesizes. Address at least one prior claim by name and identify the failure mode that still matters most.",
  },
  {
    kind: "synthesis",
    agentName: "Metis",
    systemPrompt: synthesisPrompt,
    stageDirection:
      "Close the meeting. Summarize the strongest points of agreement, preserve the most useful disagreement, and end with one clear recommended next action.",
  },
];

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

function normaliseOutput(agentName: MetisAgentName, rawText: string): MetisAgentOutput {
  const parsed = JSON.parse(extractJson(rawText)) as Partial<MetisAgentOutput>;
  const confidence = Number(parsed.confidence ?? 0.5);
  const recommendedAction = recommendedActions.includes(
    parsed.recommendedAction as (typeof recommendedActions)[number],
  )
    ? (parsed.recommendedAction as MetisAgentOutput["recommendedAction"])
    : "request_clarification";

  return {
    agentName,
    content: String(parsed.content ?? "No content returned."),
    confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0.5)),
    recommendedAction,
    summaryRationale: String(parsed.summaryRationale ?? "No rationale returned."),
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
  brief: string;
  stageDirection: string;
  discussion: CouncilContextEntry[];
  finalSynthesis?: boolean;
}) {
  const priorAgentMessages = input.discussion.filter((entry) => entry.role !== "user").length;
  const engagementInstruction =
    priorAgentMessages > 0
      ? "Reference at least one earlier speaker by name and respond to their reasoning directly. If Orion has interjected, address the latest Orion intervention explicitly."
      : "Establish the first substantive position in the meeting rather than introducing yourself or using a fixed role label.";

  const contentInstruction = input.finalSynthesis
    ? "For content, write a decisive synthesis in two short paragraphs maximum and under 180 words."
    : "For content, write a live meeting intervention in one or two short paragraphs and keep it under 120 words.";

  return [
    `Council brief:\n${input.brief}`,
    `Stage direction:\n${input.stageDirection}`,
    `Current discussion transcript:\n${formatTranscript(input.discussion)}`,
    engagementInstruction,
    contentInstruction,
    "Do not mention JSON, schemas, or formatting rules in the visible content.",
    "Return valid JSON only with exactly these fields: content, confidence, recommendedAction, summaryRationale.",
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
      max_tokens: 1400,
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

async function invokeAgent(agentName: MetisAgentName, system: string, prompt: string) {
  if (agentName === "Metis") {
    return normaliseOutput(agentName, await callAnthropic(system, prompt));
  }
  if (agentName === "Athena") {
    return normaliseOutput(agentName, await callAzure(system, prompt));
  }
  if (agentName === "Argus") {
    return normaliseOutput(agentName, await callGemini(system, prompt));
  }

  return normaliseOutput(agentName, await callXai(system, prompt));
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

    const output = await invokeAgent(
      step.agentName,
      step.systemPrompt,
      buildStructuredPrompt({
        brief: input.userMessage,
        stageDirection: step.stageDirection,
        discussion: contextSequence,
        finalSynthesis: step.kind === "synthesis",
      }),
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
