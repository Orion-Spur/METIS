import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { nanoid } from "nanoid";
import { councilMessages, councilSessions } from "@/drizzle/schema";
import type { MetisAgentOutput, MetisCouncilTurn } from "@/shared/metis";
import { ENV } from "@/lib/env";

let dbInstance: any;

function getDb() {
  if (!ENV.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured for METIS persistence.");
  }

  if (!dbInstance) {
    const pool = mysql.createPool({
      uri: ENV.DATABASE_URL,
      connectionLimit: 5,
    });

    dbInstance = drizzle(pool);
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

export async function listCouncilTurns(sessionId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(councilMessages)
    .where(eq(councilMessages.sessionId, sessionId))
    .orderBy(asc(councilMessages.sequenceOrder), asc(councilMessages.createdAt));

  return reconstructCouncilTurns(sessionId, rows);
}

export async function getOrCreateSession(existingSessionId: string | undefined, username: string) {
  const db = getDb();

  if (existingSessionId) {
    const existing = await db
      .select()
      .from(councilSessions)
      .where(eq(councilSessions.id, existingSessionId))
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }
  }

  const session = {
    id: nanoid(20),
    userId: 0,
    title: `Council session for ${username}`,
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };

  await db.insert(councilSessions).values(session);
  return session;
}

export async function persistCouncilTurn(input: {
  sessionId?: string;
  username: string;
  userMessage: string;
  outputs: MetisAgentOutput[];
  synthesis: MetisAgentOutput;
}) {
  const db = getDb();
  const session = await getOrCreateSession(input.sessionId, input.username);
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

export async function listRecentSessions() {
  const db = getDb();
  return db.select().from(councilSessions).orderBy(desc(councilSessions.updatedAt)).limit(20);
}
