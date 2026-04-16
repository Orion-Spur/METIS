import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const connectionString = process.env.METIS_DATABASE_URL;

const client = connectionString
  ? postgres(connectionString, {
      max: 1,
      prepare: false,
    })
  : null;

afterAll(async () => {
  if (client) {
    await client.end();
  }
});

describe("METIS database URL secret", () => {
  it("connects to the Neon database configured in METIS_DATABASE_URL", async () => {
    expect(connectionString).toBeTruthy();
    expect(connectionString).toContain("neon.tech");

    if (!client) {
      throw new Error("METIS_DATABASE_URL is not configured for the test environment.");
    }

    const result = await client<{ current_database: string }[]>`select current_database() as current_database`;
    expect(result[0]?.current_database).toBe("neondb");
  });
});
