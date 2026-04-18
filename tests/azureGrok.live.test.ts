import { describe, expect, it } from "vitest";
import { ENV } from "@/lib/env";

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

describe("Azure Grok credential validation", () => {
  it(
    "validates the Azure-hosted Grok deployment used by Loki",
    async () => {
      expect(ENV.AZUREGROK42_API_KEY).toBeTruthy();
      expect(ENV.AZUREGROK42_ENDPOINT).toBeTruthy();
      expect(ENV.AZUREGROK42_DEPLOYMENT).toBeTruthy();

      const url = `${ENV.AZUREGROK42_ENDPOINT!.replace(/\/$/, "")}/chat/completions`;
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": ENV.AZUREGROK42_API_KEY!,
        },
        body: JSON.stringify({
          model: ENV.AZUREGROK42_DEPLOYMENT ?? ENV.AZUREGROK42_MODEL,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_completion_tokens: 8,
          temperature: 0,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(typeof data.choices?.[0]?.message?.content).toBe("string");
    },
    30000,
  );
});
