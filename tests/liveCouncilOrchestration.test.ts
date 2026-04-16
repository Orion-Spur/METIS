import { describe, expect, it } from "vitest";
import { orchestrateCouncilTurn } from "@/lib/metisCouncil";

describe("METIS live council orchestration", () => {
  it(
    "runs a full council turn with the configured live providers",
    async () => {
      const result = await orchestrateCouncilTurn({
        sessionId: "live-validation-session",
        userMessage:
          "In one sentence each, assess whether METIS should begin with architecture planning before adding more specialist agents.",
      });

      expect(result.outputs).toHaveLength(3);
      expect(result.synthesis.agentName).toBe("Metis");
      expect(result.outputs.map((output) => output.agentName)).toEqual([
        "Athena",
        "Argus",
        "Loki",
      ]);

      for (const output of [...result.outputs, result.synthesis]) {
        expect(typeof output.content).toBe("string");
        expect(output.content.length).toBeGreaterThan(0);
        expect(typeof output.summaryRationale).toBe("string");
        expect(output.summaryRationale.length).toBeGreaterThan(0);
        expect(typeof output.confidence).toBe("number");
      }
    },
    120000,
  );
});
