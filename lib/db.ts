import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import {
  companyProfiles,
  councilMessages,
  councilSessions,
  sessionInsights,
  users,
} from "@/drizzle/schema";
import { ENV } from "@/lib/env";
import type {
  MetisCouncilMessage,
  MetisCouncilTurn,
  MetisSessionInsight,
  MetisSessionPreview,
  MetisUserAdminRecord,
} from "@/shared/metis";

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
      sessionInsights,
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

function toTimestamp(value: Date | string | number | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function truncateText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function splitTags(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function deriveInsightTags(...parts: Array<string | null | undefined>) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "against",
    "because",
    "between",
    "could",
    "every",
    "first",
    "their",
    "there",
    "these",
    "those",
    "which",
    "while",
    "would",
    "should",
    "orion",
    "metis",
    "athena",
    "argus",
    "loki",
    "council",
  ]);

  const tags = new Set<string>();

  for (const part of parts) {
    for (const word of (part ?? "").toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
      if (stopWords.has(word)) {
        continue;
      }
      tags.add(word);
      if (tags.size >= 8) {
        return Array.from(tags);
      }
    }
  }

  return Array.from(tags);
}

function buildSessionTitle(source: string) {
  const normalized = truncateText(source, 72);
  return normalized.length > 0 ? normalized : "Untitled council session";
}

function buildSessionSummary(primary: string | null | undefined, fallback?: string | null | undefined) {
  const source = primary?.trim() || fallback?.trim() || "";
  return source ? truncateText(source, 240) : null;
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

function mapAdminUser(row: typeof users.$inferSelect): MetisUserAdminRecord {
  return {
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    name: row.name ?? null,
    role: row.role,
    isActive: row.isActive,
    lastSignedIn: toTimestamp(row.lastSignedIn),
    createdAt: toTimestamp(row.createdAt),
  };
}

function mapSessionInsight(row: typeof sessionInsights.$inferSelect): MetisSessionInsight {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    insight: row.insight,
    rationale: row.rationale ?? null,
    tags: splitTags(row.tags),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

async function mapSessionPreview(
  row: typeof councilSessions.$inferSelect,
  query?: string,
): Promise<MetisSessionPreview> {
  const db = getDb();
  const turnCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(councilMessages)
    .where(and(eq(councilMessages.sessionId, row.id), eq(councilMessages.role, "user")));

  let matchedText: string | null = null;
  const trimmedQuery = query?.trim();

  if (trimmedQuery) {
    const pattern = `%${trimmedQuery}%`;
    const matchedMessage = await db
      .select({ content: councilMessages.content })
      .from(councilMessages)
      .where(and(eq(councilMessages.sessionId, row.id), ilike(councilMessages.content, pattern)))
      .orderBy(desc(councilMessages.createdAt))
      .limit(1);

    matchedText = matchedMessage[0]?.content ? truncateText(matchedMessage[0].content, 160) : null;
  }

  return {
    sessionId: row.id,
    title: row.title?.trim() || "Untitled council session",
    summary: row.summary ?? null,
    updatedAt: toTimestamp(row.updatedAt),
    createdAt: toTimestamp(row.createdAt),
    lastMessageAt: toTimestamp(row.lastMessageAt),
    turnCount: Number(turnCountResult[0]?.count ?? 0),
    matchedText,
  };
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

export async function listUsersForAdmin() {
  const db = getDb();
  const rows = await db.select().from(users).orderBy(desc(users.role), asc(users.username));
  return rows.map(mapAdminUser);
}

export async function upsertPasswordUser(input: {
  username: string;
  passwordHash: string;
  role?: "user" | "admin";
  email?: string | null;
  name?: string | null;
  isActive?: boolean;
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
      isActive: input.isActive ?? true,
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
        isActive: input.isActive ?? true,
        updatedAt: now,
      },
    });

  return findUserByIdentifier(normalizedUsername);
}

export async function updateUserAccess(userId: number, isActive: boolean) {
  const db = getDb();
  await db
    .update(users)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getUserById(userId);
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = getDb();
  await db
    .update(users)
    .set({
      role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getUserById(userId);
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

async function updateSessionMetadata(input: {
  sessionId: string;
  title?: string | null;
  summary?: string | null;
}) {
  const db = getDb();
  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof input.title !== "undefined") {
    payload.title = input.title;
  }

  if (typeof input.summary !== "undefined") {
    payload.summary = input.summary;
  }

  await db.update(councilSessions).set(payload).where(eq(councilSessions.id, input.sessionId));
}

export async function getOrCreateSession(
  existingSessionId: string | undefined,
  user: { id?: number; username: string },
  titleHint?: string,
) {
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
    title: buildSessionTitle(titleHint ?? `Council session for ${user.username}`),
    summary: null,
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
  const session = await getOrCreateSession(
    input.sessionId,
    {
      id: input.userId,
      username: input.username,
    },
    input.userMessage,
  );
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

  if (sequenceOrder === 1) {
    await updateSessionMetadata({
      sessionId: session.id,
      title: buildSessionTitle(input.userMessage),
      summary: null,
    });
  }

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

  if (input.role === "synthesis") {
    await updateSessionMetadata({
      sessionId: input.sessionId,
      summary: buildSessionSummary(input.message.summaryRationale, input.message.content),
    });
  }

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
  const rows =
    typeof userId === "number"
      ? await db
          .select()
          .from(councilSessions)
          .where(eq(councilSessions.userId, userId))
          .orderBy(desc(councilSessions.updatedAt))
          .limit(20)
      : await db.select().from(councilSessions).orderBy(desc(councilSessions.updatedAt)).limit(20);

  return Promise.all(rows.map((row) => mapSessionPreview(row)));
}

export async function searchSessionPreviews(userId: number, query: string) {
  const db = getDb();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return listRecentSessions(userId);
  }

  const pattern = `%${trimmedQuery}%`;
  const rows = await db
    .select()
    .from(councilSessions)
    .where(
      and(
        eq(councilSessions.userId, userId),
        or(
          ilike(councilSessions.title, pattern),
          ilike(councilSessions.summary, pattern),
          sql<boolean>`exists (
            select 1
            from "councilMessages" cm
            where cm."sessionId" = ${councilSessions.id}
              and cm."content" ilike ${pattern}
          )`,
        ),
      ),
    )
    .orderBy(desc(councilSessions.updatedAt))
    .limit(20);

  return Promise.all(rows.map((row) => mapSessionPreview(row, trimmedQuery)));
}

export async function listRelevantSessionInsights(input: {
  userId: number;
  query?: string;
  excludeSessionId?: string;
  limit?: number;
}) {
  const db = getDb();
  const trimmedQuery = input.query?.trim();
  const pattern = trimmedQuery ? `%${trimmedQuery}%` : undefined;
  const conditions = [eq(sessionInsights.userId, input.userId)];

  if (input.excludeSessionId) {
    conditions.push(sql`${sessionInsights.sessionId} <> ${input.excludeSessionId}` as never);
  }

  if (pattern) {
    conditions.push(
      or(
        ilike(sessionInsights.title, pattern),
        ilike(sessionInsights.insight, pattern),
        ilike(sessionInsights.tags, pattern),
      ) as never,
    );
  }

  const rows = await db
    .select()
    .from(sessionInsights)
    .where(and(...conditions))
    .orderBy(desc(sessionInsights.updatedAt))
    .limit(input.limit ?? 3);

  return rows.map(mapSessionInsight);
}

export async function refreshSessionInsight(input: { sessionId: string; userId: number }) {
  const db = getDb();
  const matchingSession = await db
    .select()
    .from(councilSessions)
    .where(and(eq(councilSessions.id, input.sessionId), eq(councilSessions.userId, input.userId)))
    .limit(1);

  const session = matchingSession[0];
  if (!session) {
    return null;
  }

  const turns = await listCouncilTurns(input.sessionId, input.userId);
  const latestTurn = turns.at(-1);
  if (!latestTurn) {
    return null;
  }

  const title = session.title?.trim() || buildSessionTitle(latestTurn.userMessage);
  const insight = buildSessionSummary(session.summary, latestTurn.synthesis.content) ?? latestTurn.synthesis.content;
  const rationale = latestTurn.synthesis.summaryRationale || null;
  const tags = deriveInsightTags(title, latestTurn.userMessage, latestTurn.synthesis.content);

  await db.delete(sessionInsights).where(eq(sessionInsights.sessionId, input.sessionId));

  const created = await db
    .insert(sessionInsights)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      title,
      insight,
      rationale,
      tags: tags.join(", "),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created[0] ? mapSessionInsight(created[0]) : null;
}
