import { describe, expect, it } from "vitest";
import { createPublicUrl, getPublicOrigin } from "@/lib/request-origin";

function createRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, {
    headers,
  });
}

describe("METIS public request origin helper", () => {
  it("prefers the browser origin header when available", () => {
    const request = createRequest("http://localhost:3000/api/auth/login", {
      origin: "https://metis.example.com",
      "x-forwarded-host": "proxy.example.com",
      "x-forwarded-proto": "https",
    });

    expect(getPublicOrigin(request)).toBe("https://metis.example.com");
    expect(createPublicUrl(request, "/council").toString()).toBe("https://metis.example.com/council");
  });

  it("falls back to forwarded headers when origin is unavailable", () => {
    const request = createRequest("http://localhost:3000/api/auth/login", {
      "x-forwarded-host": "preview.manus.space",
      "x-forwarded-proto": "https",
    });

    expect(getPublicOrigin(request)).toBe("https://preview.manus.space");
    expect(createPublicUrl(request, "/").toString()).toBe("https://preview.manus.space/");
  });

  it("falls back to the request URL origin as a last resort", () => {
    const request = createRequest("http://localhost:3000/api/auth/login");

    expect(getPublicOrigin(request)).toBe("http://localhost:3000");
  });
});
