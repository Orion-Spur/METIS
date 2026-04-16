import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

async function loadAuthModule() {
  vi.resetModules();
  return import("@/lib/auth");
}

describe("METIS authentication utilities", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "1234567890abcdef1234567890abcdef";
    process.env.METIS_LOGIN_USERNAME = "oracle";
    delete process.env.METIS_LOGIN_PASSWORD_HASH;
    delete process.env.METIS_LOGIN_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("verifies plaintext credentials when METIS_LOGIN_PASSWORD is configured", async () => {
    process.env.METIS_LOGIN_PASSWORD = "golden-key";
    const auth = await loadAuthModule();

    expect(auth.verifyCredentials("oracle", "golden-key")).toBe(true);
    expect(auth.verifyCredentials("oracle", "wrong-key")).toBe(false);
    expect(auth.verifyCredentials("intruder", "golden-key")).toBe(false);
  });

  it("verifies scrypt-hashed credentials when METIS_LOGIN_PASSWORD_HASH is configured", async () => {
    process.env.METIS_LOGIN_PASSWORD = "temporary";
    const seedModule = await loadAuthModule();
    const hash = seedModule.createScryptHash("council-secret");

    process.env.METIS_LOGIN_PASSWORD_HASH = hash;
    delete process.env.METIS_LOGIN_PASSWORD;

    const auth = await loadAuthModule();
    expect(auth.verifyCredentials("oracle", "council-secret")).toBe(true);
    expect(auth.verifyCredentials("oracle", "invalid")).toBe(false);
  });

  it("signs and verifies a session token", async () => {
    process.env.METIS_LOGIN_PASSWORD = "golden-key";
    const auth = await loadAuthModule();

    const token = await auth.signSession("oracle");
    const session = await auth.verifySessionToken(token);

    expect(session).toEqual({
      username: "oracle",
      role: "admin",
    });
  });
});
