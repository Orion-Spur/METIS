import { ENV } from "@/lib/env";
import type {
  MetisAgentName,
  MetisAgentOutput,
  MetisCouncilMessage,
  MetisCouncilTurn,
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
    "You are Athena, the strategist in the METIS council. Speak as a live participant in the meeting. Frame priorities, sequence decisions, turn ambiguity into a workable plan, and directly engage the strongest prior arguments instead of repeating a static role description.",
  Argus:
    "You are Argus, the analyst in the METIS council. Speak as a live participant in the meeting. Examine evidence, assumptions, trade-offs, and missing information with precision, and directly test the claims made by earlier speakers.",
  Loki:
    "You are Loki, the critic in the METIS council. Speak as a live participant in the meeting. Challenge weak logic, expose execution risk, and attack the most fragile assumption in the room instead of performing generic dissent.",
};

const chairPrompt =
  "You are Metis, the chair and orchestrator of the METIS council. Run the meeting actively. In chair interventions, define the crux, redirect the specialists, surface tensions, and keep the debate moving. Do not give the final answer unless explicitly asked to produce the closing synthesis.";

const synthesisPrompt =
  "You are Metis, the chair and orchestrator of the METIS council. Produce the closing synthesis after the live discussion. Integrate the strongest specialist arguments, preserve important disagreement, and end with one decisive recommended next action.";

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

function formatTranscript(discussion: MetisCouncilMessage[]) {
  if (discussion.length === 0) {
    return "No prior council discussion yet.";
  }

  return discussion
    .map(
      (message) =>
        `${message.sequenceOrder}. ${message.agentName} | confidence ${Math.round(message.confidence * 100)}% | action ${message.recommendedAction}\n${message.content}\nRationale: ${message.summaryRationale}`,
    )
    .join("\n\n");
}

function buildStructuredPrompt(input: {
  agentName: MetisAgentName;
  brief: string;
  stageDirection: string;
  discussion: MetisCouncilMessage[];
  finalSynthesis?: boolean;
}) {
  const engagementInstruction =
    input.discussion.length > 0
      ? "Reference at least one earlier speaker by name and respond to their reasoning directly."
      : "Establish the first substantive position in the meeting rather than introducing yourself.";

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

async function addDiscussionMessage(input: {
  discussion: MetisCouncilMessage[];
  agentName: MetisAgentName;
  systemPrompt: string;
  brief: string;
  stageDirection: string;
}) {
  const output = await invokeAgent(
    input.agentName,
    input.systemPrompt,
    buildStructuredPrompt({
      agentName: input.agentName,
      brief: input.brief,
      stageDirection: input.stageDirection,
      discussion: input.discussion,
    }),
  );

  return [...input.discussion, asDiscussionMessage(output, input.discussion.length + 1)];
}

export async function orchestrateCouncilTurn(input: {
  sessionId: string;
  userMessage: string;
}): Promise<MetisCouncilTurn> {
  let discussion: MetisCouncilMessage[] = [];

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Metis",
    systemPrompt: chairPrompt,
    brief: input.userMessage,
    stageDirection:
      "Open the meeting. Restate the brief, identify the central decision tension, and assign the first pass: Athena should frame the path, Argus should test the assumptions, and Loki should attack the weak points. Do not close the discussion.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Athena",
    systemPrompt: specialistPrompts.Athena,
    brief: input.userMessage,
    stageDirection:
      "Deliver the opening strategic position. Propose a practical path forward and acknowledge the central tension Metis named.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Argus",
    systemPrompt: specialistPrompts.Argus,
    brief: input.userMessage,
    stageDirection:
      "Respond after reading the chair opening and Athena's position. Validate or challenge the assumptions, identify missing evidence, and sharpen the decision criteria.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Loki",
    systemPrompt: specialistPrompts.Loki,
    brief: input.userMessage,
    stageDirection:
      "Respond after reading the prior speakers. Attack the weakest assumption on the table, expose the most serious execution risk, and make the debate more adversarial and concrete.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Metis",
    systemPrompt: chairPrompt,
    brief: input.userMessage,
    stageDirection:
      "Chair the midpoint of the meeting. Name the most important unresolved tension created by the discussion so far, explicitly reference at least two specialists, and demand sharper closing positions. Do not synthesize the final answer yet.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Athena",
    systemPrompt: specialistPrompts.Athena,
    brief: input.userMessage,
    stageDirection:
      "Revise or defend your strategy after the midpoint intervention. Address at least one criticism by name and tighten the proposed path or sequencing.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Argus",
    systemPrompt: specialistPrompts.Argus,
    brief: input.userMessage,
    stageDirection:
      "Assess whether the revised path now meets an acceptable evidence threshold. Address at least one prior speaker by name and state what still remains uncertain.",
  });

  discussion = await addDiscussionMessage({
    discussion,
    agentName: "Loki",
    systemPrompt: specialistPrompts.Loki,
    brief: input.userMessage,
    stageDirection:
      "Deliver the closing stress test before the chair synthesizes. Address at least one prior claim by name and identify the failure mode that still matters most.",
  });

  const synthesis = asDiscussionMessage(
    await invokeAgent(
      "Metis",
      synthesisPrompt,
      buildStructuredPrompt({
        agentName: "Metis",
        brief: input.userMessage,
        stageDirection:
          "Close the meeting. Summarize the strongest points of agreement, preserve the most useful disagreement, and end with one clear recommended next action.",
        discussion,
        finalSynthesis: true,
      }),
    ),
    discussion.length + 1,
  );

  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    discussion,
    synthesis,
    createdAt: Date.now(),
  };
}
