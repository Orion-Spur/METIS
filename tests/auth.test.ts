import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const findUserByIdentifier = vi.fn();
const recordSuccessfulLogin = vi.fn();

vi.mock("@/lib/db", () => ({
  findUserByIdentifier,
  recordSuccessfulLogin,
}));

async function loadAuthModule() {
  vi.resetModules();
  return import("@/lib/auth");
}

describe("METIS authentication utilities", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "1234567890abcdef1234567890abcdef";
    findUserByIdentifier.mockReset();
    recordSuccessfulLogin.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("verifies database-backed scrypt credentials and records the successful login", async () => {
    const auth = await loadAuthModule();
    const hash = auth.createScryptHash("council-secret");

    findUserByIdentifier.mockResolvedValue({
      id: 7,
      username: "orion",
      passwordHash: hash,
      role: "admin",
    });
    recordSuccessfulLogin.mockResolvedValue(undefined);

    await expect(auth.verifyCredentials("orion", "council-secret")).resolves.toEqual({
      userId: 7,
      username: "orion",
      role: "admin",
    });
    expect(recordSuccessfulLogin).toHaveBeenCalledWith(7);
  });

  it("rejects an invalid database-backed password", async () => {
    const auth = await loadAuthModule();
    const hash = auth.createScryptHash("council-secret");

    findUserByIdentifier.mockResolvedValue({
      id: 7,
      username: "orion",
      passwordHash: hash,
      role: "admin",
    });

    await expect(auth.verifyCredentials("orion", "invalid")).resolves.toBeNull();
    expect(recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("signs and verifies a session token with the METIS database user payload", async () => {
    const auth = await loadAuthModule();

    const token = await auth.signSession({
      userId: 7,
      username: "orion",
      role: "admin",
    });
    const session = await auth.verifySessionToken(token);

    expect(session).toEqual({
      userId: 7,
      username: "orion",
      role: "admin",
    });
  });

  it("throws a clear error when JWT_SECRET is missing but still allows credential checks to load", async () => {
    delete process.env.JWT_SECRET;
    const auth = await loadAuthModule();
    const hash = auth.createScryptHash("golden-key");

    findUserByIdentifier.mockResolvedValue({
      id: 1,
      username: "orion",
      passwordHash: hash,
      role: "admin",
    });
    recordSuccessfulLogin.mockResolvedValue(undefined);

    await expect(auth.verifyCredentials("orion", "golden-key")).resolves.toEqual({
      userId: 1,
      username: "orion",
      role: "admin",
    });
    await expect(
      auth.signSession({
        userId: 1,
        username: "orion",
        role: "admin",
      })
    ).rejects.toThrow("JWT_SECRET is not configured");
  });
});
