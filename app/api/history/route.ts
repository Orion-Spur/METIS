import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import {
  listCouncilTurns,
  listRecentSessions,
  listRelevantSessionInsights,
  searchSessionPreviews,
} from "@/lib/db";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  session: z.string().trim().max(64).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();

  if (!session?.username) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.parse({
    q: searchParams.get("q") ?? undefined,
    session: searchParams.get("session") ?? undefined,
  });

  const sessions = parsed.q
    ? await searchSessionPreviews(session.userId, parsed.q)
    : await listRecentSessions(session.userId);

  const turns = parsed.session ? await listCouncilTurns(parsed.session, session.userId) : [];
  const insights = await listRelevantSessionInsights({
    userId: session.userId,
    query: parsed.q,
    excludeSessionId: parsed.session,
    limit: 4,
  });

  return NextResponse.json({
    sessions,
    turns,
    insights,
  });
}
