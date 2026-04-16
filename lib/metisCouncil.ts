import { ENV } from "@/lib/env";
import type { MetisAgentName, MetisAgentOutput, MetisCouncilTurn } from "@/shared/metis";

const recommendedActions = [
  "proceed",
  "revise",
  "defer",
  "escalate",
  "request_clarification",
] as const;

const specialistPrompts: Record<Exclude<MetisAgentName, "Metis">, string> = {
  Athena:
    "You are Athena, the strategist in the METIS council. Produce strategic framing, priorities, sequencing, and concrete next steps.",
  Argus:
    "You are Argus, the analyst in the METIS council. Examine evidence, assumptions, trade-offs, risks, and missing information with precision.",
  Loki:
    "You are Loki, the critic in the METIS council. Challenge weak logic, stress-test plans, and expose contradictions or execution risk.",
};

const synthesisPrompt =
  "You are Metis, the orchestrator of the METIS council. Synthesize the specialist outputs into one coherent council position, preserving disagreement where useful and recommending the next action.";

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

function buildStructuredPrompt(agentName: MetisAgentName, brief: string) {
  return `${brief}\n\nReturn valid JSON only with exactly these fields: content, confidence, recommendedAction, summaryRationale.`;
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

export async function orchestrateCouncilTurn(input: {
  sessionId: string;
  userMessage: string;
}): Promise<MetisCouncilTurn> {
  const specialistOutputs: MetisAgentOutput[] = [];

  for (const agentName of ["Athena", "Argus", "Loki"] as const) {
    const output = await invokeAgent(
      agentName,
      specialistPrompts[agentName],
      buildStructuredPrompt(agentName, `Council brief:\n${input.userMessage}`),
    );
    specialistOutputs.push(output);
  }

  const synthesis = await invokeAgent(
    "Metis",
    synthesisPrompt,
    buildStructuredPrompt(
      "Metis",
      `Original brief:\n${input.userMessage}\n\nSpecialist outputs:\n${JSON.stringify(specialistOutputs, null, 2)}`,
    ),
  );

  return {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    outputs: specialistOutputs,
    synthesis,
    createdAt: Date.now(),
  };
}
