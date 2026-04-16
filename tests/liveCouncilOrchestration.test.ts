import { describe, expect, it } from "vitest";
import { orchestrateCouncilTurn } from "@/lib/metisCouncil";

describe("METIS live council orchestration", () => {
  it(
    "runs a chaired multi-turn council debate with the configured live providers",
    async () => {
      const result = await orchestrateCouncilTurn({
        sessionId: "live-validation-session",
        userMessage:
          "Debate whether METIS should begin with architecture planning before adding more specialist agents, and make the discussion adversarial rather than polite.",
      });

      expect(result.discussion).toHaveLength(8);
      expect(result.discussion.map((message) => message.agentName)).toEqual([
        "Metis",
        "Athena",
        "Argus",
        "Loki",
        "Metis",
        "Athena",
        "Argus",
        "Loki",
      ]);
      expect(result.discussion.map((message) => message.sequenceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.synthesis.agentName).toBe("Metis");
      expect(result.synthesis.sequenceOrder).toBe(9);

      for (const output of [...result.discussion, result.synthesis]) {
        expect(typeof output.content).toBe("string");
        expect(output.content.length).toBeGreaterThan(0);
        expect(typeof output.summaryRationale).toBe("string");
        expect(output.summaryRationale.length).toBeGreaterThan(0);
        expect(typeof output.confidence).toBe("number");
      }
    },
    180000,
  );
});
