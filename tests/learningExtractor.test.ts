import { describe, expect, it, vi } from "vitest";
import { extractLearnings } from "@/lib/learningExtractor";
import type { MetisCouncilMessage } from "@/shared/metis";

function buildMessage(overrides: Partial<MetisCouncilMessage>): MetisCouncilMessage {
  return {
    sequenceOrder: 0,
    agentName: "Metis",
    content: "",
    confidence: 0.8,
    recommendedAction: "proceed",
    summaryRationale: "",
    ...overrides,
  };
}

function mockAnthropicResponse(payload: unknown): Response {
  const body = {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload),
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const sampleTranscript: MetisCouncilMessage[] = [
  buildMessage({
    agentName: "Metis",
    content: "The brief is whether to price AXS Audit at £8k or £12k. Let us test both.",
  }),
  buildMessage({
    agentName: "Athena",
    content: "At £8k we enter the practitioner mid-market cleanly. At £12k we lose that entry point.",
  }),
  buildMessage({
    agentName: "Argus",
    content: "Eye-Able sits at roughly £9k annualised. Pricing at £8k differentiates on value, not discount.",
  }),
  buildMessage({
    agentName: "Loki",
    content: "Eight thousand signals small-tool positioning. If enterprise sees that price they will doubt depth.",
  }),
  buildMessage({
    agentName: "Metis",
    content:
      "Final: price AXS Audit at £8k for the practitioner tier. Surviving concern from Loki is enterprise perception, and we will address that with a separate enterprise tier.",
  }),
];

const sampleSynthesis = buildMessage({
  agentName: "Metis",
  content:
    "Decision: £8k for practitioner tier. Commitment: draft enterprise-tier positioning before next session. Loki's enterprise-perception risk is logged.",
});

describe("extractLearnings", () => {
  it("returns parsed learnings when the extractor produces valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        learnings: [
          {
            kind: "decision",
            statement: "Price AXS Audit at £8k per year for the practitioner tier.",
            confidence: "firm",
            supportingAgents: ["Metis", "Athena", "Argus"],
            dissent: "Loki flagged enterprise-perception risk at this price point.",
            rationale: "Clean entry into the practitioner mid-market against Eye-Able at £9k.",
            tags: ["axs-audit", "pricing", "practitioner-tier"],
          },
          {
            kind: "commitment",
            statement: "Draft enterprise-tier positioning before the next council session.",
            confidence: "firm",
            supportingAgents: ["Metis"],
            dissent: null,
            rationale: "Addresses Loki's surviving concern about enterprise perception.",
            tags: ["axs-audit", "enterprise-tier", "positioning"],
          },
        ],
      })
    );

    const result = await extractLearnings({
      brief: "Price AXS Audit at £8k or £12k?",
      transcript: sampleTranscript,
      synthesis: sampleSynthesis,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("decision");
    expect(result[0].confidence).toBe("firm");
    expect(result[0].dissent).toContain("enterprise");
    expect(result[1].kind).toBe("commitment");
    expect(result[1].tags).toContain("enterprise-tier");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("strips markdown fences if the model wraps JSON in them", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse(
        '```json\n{"learnings":[{"kind":"principle","statement":"Always validate WCAG automation against manual review before shipping.","confidence":"firm","supportingAgents":["Metis"],"dissent":null,"rationale":null,"tags":["wcag","automation"]}]}\n```'
      )
    );

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("principle");
  });

  it("returns an empty array rather than crashing when the extractor returns invalid JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockAnthropicResponse("I cannot do that, sorry."));

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toEqual([]);
  });

  it("returns an empty array when the response fails schema validation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockAnthropicResponse({
        learnings: [
          {
            kind: "not-a-real-kind",
            statement: "short",
          },
        ],
      })
    );

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toEqual([]);
  });

  it("returns an empty array and does not throw when the API responds with a 500", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("server error", { status: 500 }));

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toEqual([]);
  });

  it("returns an empty array and does not throw when fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toEqual([]);
  });

  it("skips the call entirely when no API key is configured", async () => {
    const fetchImpl = vi.fn();

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "",
    });

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts an empty learnings array (trivial session) without treating it as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockAnthropicResponse({ learnings: [] }));

    const result = await extractLearnings({
      brief: "",
      transcript: [],
      synthesis: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });

    expect(result).toEqual([]);
  });
});
