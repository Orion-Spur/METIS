import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import {
  companyProfiles,
  councilMessages,
  councilSessions,
  users,
} from "@/drizzle/schema";
import { ENV } from "@/lib/env";
import type { MetisCouncilMessage, MetisCouncilTurn } from "@/shared/metis";

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
      companyProfiles,
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

function mapAgentMessage(row: typeof councilMessages.$inferSelect): MetisCouncilMessage {
  return {
    sequenceOrder: row.sequenceOrder,
    agentName: row.agentName ?? "Metis",
    content: row.content,
    confidence: toNumber(row.confidence) ?? 0,
    recommendedAction: row.recommendedAction ?? "request_clarification",
    summaryRationale: row.summaryRationale ?? "",
  };
}

function mapTurn(rows: Array<typeof councilMessages.$inferSelect>, sessionId: string): MetisCouncilTurn | null {
  if (rows.length === 0) {
    return null;
  }

  const userMessage = rows.find((row) => row.role === "user");
  const synthesis = rows.find((row) => row.role === "synthesis");
  const discussion = rows
    .filter((row) => row.role === "agent" && row.agentName)
    .map(mapAgentMessage);

  if (!userMessage || !synthesis || !synthesis.agentName) {
    return null;
  }

  return {
    sessionId,
    userMessage: userMessage.content,
    discussion,
    synthesis: mapAgentMessage(synthesis),
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

export async function getCompanyProfile(slug = "default") {
  const db = getDb();
  const result = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.slug, slug))
    .limit(1);

  return result[0] ?? null;
}

export async function upsertCompanyProfile(input: {
  slug?: string;
  name: string;
  mission: string;
  products: string;
  customers?: string | null;
  constraints?: string | null;
  teamSize?: number | null;
  stage?: string | null;
  operatingModel?: string | null;
  geography?: string | null;
}) {
  const db = getDb();
  const now = new Date();
  const slug = input.slug?.trim() || "default";

  await db
    .insert(companyProfiles)
    .values({
      slug,
      name: input.name,
      mission: input.mission,
      products: input.products,
      customers: input.customers ?? null,
      constraints: input.constraints ?? null,
      teamSize: input.teamSize ?? null,
      stage: input.stage ?? null,
      operatingModel: input.operatingModel ?? null,
      geography: input.geography ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: companyProfiles.slug,
      set: {
        name: input.name,
        mission: input.mission,
        products: input.products,
        customers: input.customers ?? null,
        constraints: input.constraints ?? null,
        teamSize: input.teamSize ?? null,
        stage: input.stage ?? null,
        operatingModel: input.operatingModel ?? null,
        geography: input.geography ?? null,
        updatedAt: now,
      },
    });

  return getCompanyProfile(slug);
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
          : eq(councilSessions.id, existingSessionId),
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

async function touchSession(sessionId: string) {
  const db = getDb();

  await db
    .update(councilSessions)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(councilSessions.id, sessionId));
}

export async function startCouncilSessionTurn(input: {
  sessionId?: string;
  userId?: number;
  username: string;
  userMessage: string;
}) {
  const db = getDb();
  const session = await getOrCreateSession(input.sessionId, {
    id: input.userId,
    username: input.username,
  });
  const sequenceOrder = (await getNextSequenceOrder(session.id)) + 1;

  await db.insert(councilMessages).values({
    id: nanoid(20),
    sessionId: session.id,
    sequenceOrder,
    role: "user",
    agentName: null,
    content: input.userMessage,
    confidence: null,
    recommendedAction: null,
    summaryRationale: null,
    createdAt: new Date(),
  });

  await touchSession(session.id);

  return {
    sessionId: session.id,
    sequenceOrder,
  };
}

export async function appendCouncilMessage(input: {
  sessionId: string;
  role: "agent" | "synthesis";
  message: MetisCouncilMessage;
}) {
  const db = getDb();
  const sequenceOrder = (await getNextSequenceOrder(input.sessionId)) + 1;

  await db.insert(councilMessages).values({
    id: nanoid(20),
    sessionId: input.sessionId,
    sequenceOrder,
    role: input.role,
    agentName: input.message.agentName,
    content: input.message.content,
    confidence: input.message.confidence.toFixed(2),
    recommendedAction: input.message.recommendedAction,
    summaryRationale: input.message.summaryRationale,
    createdAt: new Date(),
  });

  await touchSession(input.sessionId);

  return {
    sequenceOrder,
  };
}

export async function persistCouncilTurn(input: {
  sessionId?: string;
  userId?: number;
  username: string;
  userMessage: string;
  discussion: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage;
}) {
  const started = await startCouncilSessionTurn({
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    userMessage: input.userMessage,
  });

  for (const message of input.discussion) {
    await appendCouncilMessage({
      sessionId: started.sessionId,
      role: "agent",
      message,
    });
  }

  await appendCouncilMessage({
    sessionId: started.sessionId,
    role: "synthesis",
    message: input.synthesis,
  });

  return {
    sessionId: started.sessionId,
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
