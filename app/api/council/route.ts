import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { persistCouncilTurn } from "@/lib/db";
import { orchestrateCouncilTurn } from "@/lib/metisCouncil";

const requestSchema = z.object({
  sessionId: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(8000),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.username) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const initialSessionId = body.sessionId ?? `pending-${session.username}`;
    const turn = await orchestrateCouncilTurn({
      sessionId: initialSessionId,
      userMessage: body.message,
    });

    const persisted = await persistCouncilTurn({
      sessionId: body.sessionId,
      userId: session.userId,
      username: session.username,
      userMessage: body.message,
      discussion: turn.discussion,
      synthesis: turn.synthesis,
    });

    return NextResponse.json({
      sessionId: persisted.sessionId,
      turn: {
        ...turn,
        sessionId: persisted.sessionId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The METIS council could not process this request.",
      },
      { status: 500 },
    );
  }
}
