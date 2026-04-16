import { scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.METIS_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("No database URL is configured.");
}

const username = process.argv[2] || "orion";
const password = process.argv[3] || "council-secret";
const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const result = await sql`
    update public.users
    set "passwordHash" = ${passwordHash},
        "loginMethod" = 'password',
        "updatedAt" = now()
    where username = ${username}
    returning id, username, role
  `;

  if (result.length === 0) {
    throw new Error(`User ${username} was not found.`);
  }

  console.log(JSON.stringify({ username, password, updated: result[0] }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
