import { describe, expect, it } from "vitest";
import { ENV } from "@/lib/env";

const describeLive = process.env.RUN_LIVE_PROVIDER_TESTS === "1" ? describe : describe.skip;

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

describeLive("METIS live provider credential validation", () => {
  it("validates the Anthropic credential", async () => {
    expect(ENV.ANTHROPIC_API_KEY).toBeTruthy();

    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ENV.ANTHROPIC_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with OK." }],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(typeof data.content?.[0]?.text).toBe("string");
  }, 30000);

  it("validates the Azure GPT credential and deployment configuration", async () => {
    expect(ENV.AZUREGPT54_API_KEY).toBeTruthy();
    expect(ENV.AZUREGPT54_ENDPOINT).toBeTruthy();
    expect(ENV.AZUREGPT54_DEPLOYMENT).toBeTruthy();

    const url = `${ENV.AZUREGPT54_ENDPOINT!.replace(/\/$/, "")}/openai/deployments/${ENV.AZUREGPT54_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": ENV.AZUREGPT54_API_KEY!,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Reply with OK." }],
        max_completion_tokens: 8,
        temperature: 0,
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(typeof data.choices?.[0]?.message?.content).toBe("string");
  }, 30000);

  it("validates the Gemini credential", async () => {
    expect(ENV.GEMINI_API_KEY).toBeTruthy();

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
            parts: [{ text: "Reply with OK." }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 24,
        },
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect((data.candidates?.length ?? 0) > 0).toBe(true);
  }, 30000);

  it("validates the Azure Grok credential and deployment configuration", async () => {
    expect(ENV.AZUREGROK42_API_KEY).toBeTruthy();
    expect(ENV.AZUREGROK42_ENDPOINT).toBeTruthy();
    expect(ENV.AZUREGROK42_DEPLOYMENT).toBeTruthy();

    const url = `${ENV.AZUREGROK42_ENDPOINT!.replace(/\/$/, "")}/openai/deployments/${ENV.AZUREGROK42_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": ENV.AZUREGROK42_API_KEY!,
      },
      body: JSON.stringify({
        model: ENV.AZUREGROK42_MODEL,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_completion_tokens: 8,
        temperature: 0,
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(typeof data.choices?.[0]?.message?.content).toBe("string");
  }, 30000);
});
