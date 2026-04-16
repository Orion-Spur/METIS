import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { councilMessages, councilSessions, users } from "@/drizzle/schema";
import { ENV } from "@/lib/env";
import type { MetisAgentOutput, MetisCouncilTurn } from "@/shared/metis";

function createDb() {
  if (!ENV.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured for METIS persistence.");
  }

  const client = postgres(ENV.DATABASE_URL, {
    max: 5,
    prepare: false,
  });

  return drizzle(client, {
    schema: {
      users,
      councilSessions,
      councilMessages,
    },
  });
}

let dbInstance: ReturnType<typeof createDb> | null = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = createDb();
  }

  return dbInstance;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return null;
}

function mapTurn(rows: Array<(typeof councilMessages.$inferSelect) & { sessionCreatedAt?: Date | null }>, sessionId: string): MetisCouncilTurn | null {
  if (rows.length === 0) {
    return null;
  }

  const userMessage = rows.find((row) => row.role === "user");
  const synthesis = rows.find((row) => row.role === "synthesis");
  const outputs = rows
    .filter((row) => row.role === "agent" && row.agentName)
    .map((row) => ({
      agentName: row.agentName!,
      content: row.content,
      confidence: toNumber(row.confidence) ?? 0,
      recommendedAction: row.recommendedAction ?? "request_clarification",
      summaryRationale: row.summaryRationale ?? "",
    }));

  if (!userMessage || !synthesis || !synthesis.agentName) {
    return null;
  }

  return {
    sessionId,
    userMessage: userMessage.content,
    outputs,
    synthesis: {
      agentName: synthesis.agentName,
      content: synthesis.content,
      confidence: toNumber(synthesis.confidence) ?? 0,
      recommendedAction: synthesis.recommendedAction ?? "request_clarification",
      summaryRationale: synthesis.summaryRationale ?? "",
    },
    createdAt: new Date(userMessage.createdAt).getTime(),
  };
}

export function splitRowsIntoTurns(rows: Array<typeof councilMessages.$inferSelect>) {
  const groups: Array<Array<typeof councilMessages.$inferSelect>> = [];
  let current: Array<typeof councilMessages.$inferSelect> = [];

  for (const row of rows) {
    if (row.role === "user" && current.length > 0) {
      groups.push(current);
      current = [];
    }

    current.push(row);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

async function getNextSequenceOrder(sessionId: string) {
  const db = getDb();
  const result = await db
    .select({ maxValue: sql<number>`coalesce(max(${councilMessages.sequenceOrder}), 0)` })
    .from(councilMessages)
    .where(eq(councilMessages.sessionId, sessionId));

  return Number(result[0]?.maxValue ?? 0);
}

export function reconstructCouncilTurns(sessionId: string, rows: Array<typeof councilMessages.$inferSelect>) {
  return splitRowsIntoTurns(rows)
    .map((turnRows) => mapTurn(turnRows, sessionId))
    .filter((turn): turn is MetisCouncilTurn => Boolean(turn));
}

export async function findUserByIdentifier(identifier: string) {
  const normalizedIdentifier = identifier.trim();
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(or(eq(users.username, normalizedIdentifier), eq(users.email, normalizedIdentifier)))
    .limit(1);

  return result[0] ?? null;
}

export async function getUserById(userId: number) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}

export async function upsertPasswordUser(input: {
  username: string;
  passwordHash: string;
  role?: "user" | "admin";
  email?: string | null;
  name?: string | null;
}) {
  const now = new Date();
  const normalizedUsername = input.username.trim();
  const db = getDb();

  await db
    .insert(users)
    .values({
      openId: `local:${normalizedUsername}`,
      username: normalizedUsername,
      passwordHash: input.passwordHash,
      name: input.name ?? normalizedUsername,
      email: input.email ?? null,
      loginMethod: "password",
      role: input.role ?? "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    })
    .onConflictDoUpdate({
      target: users.username,
      set: {
        openId: `local:${normalizedUsername}`,
        passwordHash: input.passwordHash,
        name: input.name ?? normalizedUsername,
        email: input.email ?? null,
        loginMethod: "password",
        role: input.role ?? "admin",
        updatedAt: now,
      },
    });

  return findUserByIdentifier(normalizedUsername);
}

export async function recordSuccessfulLogin(userId: number) {
  const db = getDb();
  const now = new Date();

  await db
    .update(users)
    .set({
      lastSignedIn: now,
      updatedAt: now,
      loginMethod: "password",
    })
    .where(eq(users.id, userId));
}

export async function listCouncilTurns(sessionId: string, userId?: number) {
  const db = getDb();

  if (typeof userId === "number") {
    const matchingSession = await db
      .select({ id: councilSessions.id })
      .from(councilSessions)
      .where(and(eq(councilSessions.id, sessionId), eq(councilSessions.userId, userId)))
      .limit(1);

    if (!matchingSession[0]) {
      return [];
    }
  }

  const rows = await db
    .select()
    .from(councilMessages)
    .where(eq(councilMessages.sessionId, sessionId))
    .orderBy(asc(councilMessages.sequenceOrder), asc(councilMessages.createdAt));

  return reconstructCouncilTurns(sessionId, rows);
}

export async function getOrCreateSession(existingSessionId: string | undefined, user: { id?: number; username: string }) {
  const db = getDb();

  if (existingSessionId) {
    const existing = await db
      .select()
      .from(councilSessions)
      .where(
        typeof user.id === "number"
          ? and(eq(councilSessions.id, existingSessionId), eq(councilSessions.userId, user.id))
          : eq(councilSessions.id, existingSessionId)
      )
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }
  }

  const now = new Date();
  const session = {
    id: nanoid(20),
    userId: user.id ?? 0,
    title: `Council session for ${user.username}`,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };

  await db.insert(councilSessions).values(session);
  return session;
}

export async function persistCouncilTurn(input: {
  sessionId?: string;
  userId?: number;
  username: string;
  userMessage: string;
  outputs: MetisAgentOutput[];
  synthesis: MetisAgentOutput;
}) {
  const db = getDb();
  const session = await getOrCreateSession(input.sessionId, {
    id: input.userId,
    username: input.username,
  });
  let sequenceOrder = await getNextSequenceOrder(session.id);

  await db.insert(councilMessages).values({
    id: nanoid(20),
    sessionId: session.id,
    sequenceOrder: ++sequenceOrder,
    role: "user",
    agentName: null,
    content: input.userMessage,
    confidence: null,
    recommendedAction: null,
    summaryRationale: null,
    createdAt: new Date(),
  });

  for (const output of input.outputs) {
    await db.insert(councilMessages).values({
      id: nanoid(20),
      sessionId: session.id,
      sequenceOrder: ++sequenceOrder,
      role: "agent",
      agentName: output.agentName,
      content: output.content,
      confidence: output.confidence.toFixed(2),
      recommendedAction: output.recommendedAction,
      summaryRationale: output.summaryRationale,
      createdAt: new Date(),
    });
  }

  await db.insert(councilMessages).values({
    id: nanoid(20),
    sessionId: session.id,
    sequenceOrder: ++sequenceOrder,
    role: "synthesis",
    agentName: input.synthesis.agentName,
    content: input.synthesis.content,
    confidence: input.synthesis.confidence.toFixed(2),
    recommendedAction: input.synthesis.recommendedAction,
    summaryRationale: input.synthesis.summaryRationale,
    createdAt: new Date(),
  });

  await db
    .update(councilSessions)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(councilSessions.id, session.id));

  return {
    sessionId: session.id,
  };
}

export async function listRecentSessions(userId?: number) {
  const db = getDb();

  if (typeof userId === "number") {
    return db
      .select()
      .from(councilSessions)
      .where(eq(councilSessions.userId, userId))
      .orderBy(desc(councilSessions.updatedAt))
      .limit(20);
  }

  return db.select().from(councilSessions).orderBy(desc(councilSessions.updatedAt)).limit(20);
}
