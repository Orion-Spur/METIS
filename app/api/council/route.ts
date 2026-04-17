import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import {
  appendCouncilMessage,
  listCouncilTurns,
  startCouncilSessionTurn,
} from "@/lib/db";
import { streamCouncilTurn } from "@/lib/metisCouncil";

const encoder = new TextEncoder();

const requestSchema = z.object({
  sessionId: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(8000),
  liveContext: z
    .array(
      z.object({
        role: z.enum(["user", "agent", "synthesis"]),
        speakerName: z.enum(["Orion", "Metis", "Athena", "Argus", "Loki"]),
        content: z.string().min(1).max(12000),
        sequenceOrder: z.number().int().nonnegative(),
        confidence: z.number().min(0).max(1).optional(),
        recommendedAction: z
          .enum(["proceed", "revise", "defer", "escalate", "request_clarification"])
          .optional(),
        summaryRationale: z.string().optional(),
      }),
    )
    .optional(),
});

function encodeEvent(payload: unknown) {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.username) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const history = !body.liveContext && body.sessionId
      ? await listCouncilTurns(body.sessionId, session.userId)
      : [];
    const started = await startCouncilSessionTurn({
      sessionId: body.sessionId,
      userId: session.userId,
      username: session.username,
      userMessage: body.message,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const closeController = () => {
          if (closed) {
            return;
          }

          closed = true;
          try {
            controller.close();
          } catch {
            // Ignore double-close races from aborted readers.
          }
        };

        const enqueue = (payload: unknown) => {
          if (closed || request.signal.aborted) {
            return;
          }

          try {
            controller.enqueue(encodeEvent(payload));
          } catch {
            closed = true;
          }
        };

        request.signal.addEventListener("abort", () => {
          closeController();
        });

        const run = async () => {
          enqueue({
            type: "start",
            sessionId: started.sessionId,
            userMessage: body.message,
          });

          try {
            const result = await streamCouncilTurn({
              sessionId: started.sessionId,
              userMessage: body.message,
              history,
              historyEntries: body.liveContext,
              shouldStop: () => request.signal.aborted,
              onEvent: async (event) => {
                if (request.signal.aborted) {
                  return;
                }

                const persisted = await appendCouncilMessage({
                  sessionId: started.sessionId,
                  role: event.kind === "discussion" ? "agent" : "synthesis",
                  message: event.message,
                });

                enqueue({
                  type: "message",
                  kind: event.kind,
                  sessionId: started.sessionId,
                  message: {
                    ...event.message,
                    sequenceOrder: persisted.sequenceOrder,
                  },
                });
              },
            });

            enqueue({
              type: "complete",
              sessionId: started.sessionId,
              completed: result.completed,
            });
          } catch (error) {
            enqueue({
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "The METIS council could not process this request.",
            });
          } finally {
            closeController();
          }
        };

        void run();
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "The METIS council could not process this request.",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }
}
