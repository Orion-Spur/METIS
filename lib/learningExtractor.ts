import { z } from "zod";
import { ENV } from "@/lib/env";
import type { ExtractedLearning, MetisCouncilMessage } from "@/shared/metis";

const extractedLearningSchema = z.object({
  kind: z.enum(["decision", "principle", "risk", "open_question", "rejected_option", "commitment"]),
  statement: z.string().min(10).max(400),
  confidence: z.enum(["firm", "provisional", "exploratory"]),
  supportingAgents: z.array(z.enum(["Metis", "Athena", "Argus", "Loki"])).default([]),
  dissent: z.string().max(400).nullable().default(null),
  rationale: z.string().max(400).nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
});

const extractionResponseSchema = z.object({
  learnings: z.array(extractedLearningSchema).max(20),
});

const EXTRACTION_SYSTEM_PROMPT = `You are the METIS council's archivist. Your job is to read a completed council transcript and produce a structured set of atomic learnings that deserve to survive beyond this session.

An atomic learning is a single, reusable statement the council can carry into future sessions. Each learning has a kind:

- decision: the council landed on a specific course of action ("AXS Audit will launch with practitioner-tier pricing at £8k/year")
- principle: a reusable rule or heuristic the council committed to ("Never automate a WCAG criterion until manual validation confirms the approach")
- risk: a named threat the council wants to remember ("Competitor pricing below £5k would force a product-tier rethink")
- open_question: an unresolved question worth revisiting ("Whether CAM ID should be federated or centralised")
- rejected_option: a path the council considered and explicitly ruled out, plus why ("Rejected WordPress plugin distribution because the audit depth cannot survive hosted-plugin sandboxing")
- commitment: a follow-up action the council bound itself to ("Metis will draft the first benchmark dataset before next session")

CRITICAL RULES

1. Every learning must come from the transcript. Do not invent, generalise, or smuggle in outside knowledge. If the council did not say something, do not record it.
2. Be atomic. One learning = one thing. If two claims are independent, split them.
3. Statements must be standalone. A reader six months from now, with no access to this transcript, must understand the learning. "Go with option B" is useless; "Price AXS Audit at £8k/year for the practitioner tier" is usable.
4. Confidence reflects the council's actual stance:
   - firm: the chair converged and the challenge round did not break it
   - provisional: directionally agreed but with surviving dissent or incomplete evidence
   - exploratory: raised and considered but not landed
5. If Loki or another agent challenged a decision and that challenge survived the round, capture it in dissent.
6. Tags should be short, searchable keywords drawn from the actual content. No generic tags like "business" or "strategy".
7. Supporting agents are the ones who actively backed the learning. Do not list every agent who was present.
8. A typical session produces 3 to 10 learnings. If you produce fewer than 2 or more than 15, you are probably doing this wrong.

OUTPUT FORMAT

Return ONLY valid JSON matching this exact shape, with no prose, no markdown, no commentary:

{
  "learnings": [
    {
      "kind": "decision",
      "statement": "...",
      "confidence": "firm",
      "supportingAgents": ["Metis", "Athena"],
      "dissent": "...",
      "rationale": "...",
      "tags": ["..."]
    }
  ]
}

If the transcript does not contain enough substantive deliberation to extract any learnings (for example, a trivial exchange or an aborted session), return {"learnings": []}.`;

function buildExtractionUserPrompt(input: {
  brief: string;
  transcript: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage | null;
}) {
  const lines = [
    `Council brief from Orion:\n${input.brief}`,
    "",
    "Council transcript:",
  ];

  for (const message of input.transcript) {
    const speaker = message.agentName ?? "Orion";
    lines.push(`[${speaker}] ${message.content}`);
  }

  if (input.synthesis) {
    lines.push("", `Final synthesis by Metis:\n${input.synthesis.content}`);
  }

  lines.push(
    "",
    "Extract the atomic learnings from this transcript following the rules above. Return JSON only."
  );

  return lines.join("\n");
}

type FetchLike = typeof fetch;

export async function extractLearnings(input: {
  brief: string;
  transcript: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage | null;
  fetchImpl?: FetchLike;
  apiKey?: string;
  model?: string;
}): Promise<ExtractedLearning[]> {
  const apiKey = input.apiKey ?? ENV.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[extractLearnings] ANTHROPIC_API_KEY not set, skipping extraction");
    return [];
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    model: input.model ?? ENV.METIS_LEARNING_EXTRACTOR_MODEL,
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildExtractionUserPrompt({
          brief: input.brief,
          transcript: input.transcript,
          synthesis: input.synthesis,
        }),
      },
    ],
  };

  let response: Response;
  try {
    response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.warn("[extractLearnings] network error, skipping extraction", error);
    return [];
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.warn(
      `[extractLearnings] Anthropic returned ${response.status}, skipping extraction`,
      bodyText.slice(0, 500)
    );
    return [];
  }

  const data = (await response.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }> }
    | null;

  if (!data) {
    console.warn("[extractLearnings] could not parse Anthropic response body");
    return [];
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  const jsonString = stripJsonFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    console.warn("[extractLearnings] extractor returned non-JSON, skipping", text.slice(0, 300));
    return [];
  }

  const result = extractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(
      "[extractLearnings] extractor JSON failed schema validation",
      result.error.issues.slice(0, 5)
    );
    return [];
  }

  return result.data.learnings;
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
