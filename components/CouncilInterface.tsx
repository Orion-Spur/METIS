"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, LogOut, SendHorizontal, Square } from "lucide-react";
import type {
  MetisAgentName,
  MetisCouncilTurn,
  MetisRecommendedAction,
} from "@/shared/metis";
import { metisAgentProfiles } from "@/shared/metis";

type Props = {
  initialSessionId?: string;
  initialTurns: MetisCouncilTurn[];
  username: string;
};

type LiveCouncilMessage = {
  id: string;
  role: "user" | "agent" | "synthesis";
  speakerName: MetisAgentName | "Orion";
  content: string;
  sequenceOrder: number;
  confidence?: number;
  recommendedAction?: MetisRecommendedAction;
  summaryRationale?: string;
};

type StreamEvent =
  | {
      type: "start";
      sessionId: string;
      userMessage: string;
    }
  | {
      type: "message";
      kind: "discussion" | "synthesis";
      sessionId: string;
      message: {
        agentName: MetisAgentName;
        content: string;
        sequenceOrder: number;
        confidence: number;
        recommendedAction: MetisRecommendedAction;
        summaryRationale: string;
      };
    }
  | {
      type: "complete";
      sessionId: string;
      completed: boolean;
    }
  | {
      type: "error";
      error: string;
    };

function formatRecommendedAction(action?: MetisRecommendedAction) {
  if (!action) return null;
  return action.replaceAll("_", " ");
}

function flattenTurns(turns: MetisCouncilTurn[]): LiveCouncilMessage[] {
  return turns.flatMap((turn, turnIndex) => {
    const turnPrefix = `${turn.sessionId}-${turn.createdAt}-${turnIndex}`;

    return [
      {
        id: `${turnPrefix}-user`,
        role: "user" as const,
        speakerName: "Orion" as const,
        content: turn.userMessage,
        sequenceOrder: 0,
      },
      ...turn.discussion.map((message) => ({
        id: `${turnPrefix}-discussion-${message.sequenceOrder}-${message.agentName}`,
        role: "agent" as const,
        speakerName: message.agentName,
        content: message.content,
        sequenceOrder: message.sequenceOrder,
        confidence: message.confidence,
        recommendedAction: message.recommendedAction,
        summaryRationale: message.summaryRationale,
      })),
      {
        id: `${turnPrefix}-synthesis-${turn.synthesis.sequenceOrder}`,
        role: "synthesis" as const,
        speakerName: turn.synthesis.agentName,
        content: turn.synthesis.content,
        sequenceOrder: turn.synthesis.sequenceOrder,
        confidence: turn.synthesis.confidence,
        recommendedAction: turn.synthesis.recommendedAction,
        summaryRationale: turn.synthesis.summaryRationale,
      },
    ];
  });
}

function getMessageVisuals(message: LiveCouncilMessage) {
  if (message.role === "user") {
    return {
      alignClassName: "items-end",
      containerClassName:
        "ml-auto border-[rgba(214,162,79,0.34)] bg-[linear-gradient(180deg,rgba(214,162,79,0.18),rgba(20,12,4,0.9))]",
      accentClassName: "text-[#f2c46e]",
      metaLabel: "Orion interjection",
    };
  }

  const profile = metisAgentProfiles[message.speakerName as MetisAgentName];
  return {
    alignClassName: "items-start",
    containerClassName: `mr-auto bg-[rgba(12,10,8,0.92)] ${profile.borderClassName}`,
    accentClassName: profile.accentClassName,
    metaLabel: message.role === "synthesis" ? "Metis synthesis" : "Council message",
  };
}

export default function CouncilInterface({ initialSessionId, initialTurns, username }: Props) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [messages, setMessages] = useState<LiveCouncilMessage[]>(() => flattenTurns(initialTurns));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<LiveCouncilMessage[]>(messages);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const councilStatus = useMemo(() => {
    if (isStreaming) return "Council is speaking live";
    if (messages.length === 0) return "Awaiting the first brief";
    return "Live chaired debate ready";
  }, [isStreaming, messages.length]);

  const consumeCouncilStream = async (response: Response) => {
    if (!response.body) {
      throw new Error("The council stream did not return a readable body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const event = JSON.parse(trimmed) as StreamEvent;

        if (event.type === "start") {
          setSessionId(event.sessionId);
          continue;
        }

        if (event.type === "message") {
          setMessages((current) => [
            ...current,
            {
              id: `${event.sessionId}-${event.message.sequenceOrder}-${event.message.agentName}`,
              role: event.kind === "synthesis" ? "synthesis" : "agent",
              speakerName: event.message.agentName,
              content: event.message.content,
              sequenceOrder: event.message.sequenceOrder,
              confidence: event.message.confidence,
              recommendedAction: event.message.recommendedAction,
              summaryRationale: event.message.summaryRationale,
            },
          ]);
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.error);
        }
      }
    }
  };

  const submitMessage = async (rawMessage: string) => {
    const trimmedMessage = rawMessage.trim();
    if (!trimmedMessage) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsStreaming(true);
    setActivePrompt(trimmedMessage);
    setMessage("");
    setMessages((current) => [
      ...current,
      {
        id: `orion-${Date.now()}`,
        role: "user",
        speakerName: "Orion",
        content: trimmedMessage,
        sequenceOrder: current.length + 1,
      },
    ]);

    try {
      const response = await fetch("/api/council", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: trimmedMessage,
          liveContext: messagesRef.current.map((entry) => ({
            role: entry.role,
            speakerName: entry.speakerName,
            content: entry.content,
            sequenceOrder: entry.sequenceOrder,
            confidence: entry.confidence,
            recommendedAction: entry.recommendedAction,
            summaryRationale: entry.summaryRationale,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "The council could not process that request." }));
        throw new Error(payload.error ?? "The council could not process that request.");
      }

      await consumeCouncilStream(response);
    } catch (submissionError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The council could not process that request.",
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
      setActivePrompt(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage(message);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setActivePrompt(null);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(214,162,79,0.12),transparent_24%),linear-gradient(180deg,#060606,#090705)] px-4 py-6 text-[#f4e7c5] md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] border border-[rgba(214,162,79,0.22)] bg-[rgba(10,8,6,0.82)] p-5 shadow-[0_0_40px_rgba(214,162,79,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-[rgba(214,162,79,0.78)]">
                METIS Council
              </p>
              <h1 className="mt-3 font-serif text-5xl text-[#f6e7be]">
                Intelligence. Strategy. Execution.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[rgba(243,231,192,0.76)]">
                Welcome, {username}. Metis now chairs the room as a live session: Orion can brief,
                interrupt, redirect, and watch each contribution arrive in sequence before the
                closing synthesis lands.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-[rgba(214,162,79,0.22)] px-4 py-2 text-xs uppercase tracking-[0.35em] text-[rgba(243,231,192,0.72)]">
                {councilStatus}
              </div>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(214,162,79,0.22)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[rgba(243,231,192,0.8)] transition hover:border-[rgba(214,162,79,0.44)]"
                >
                  <LogOut className="h-4 w-4" />
                  Exit
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_2.25fr]">
          <aside className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">
              Council Members
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Object.entries(metisAgentProfiles).map(([name, profile]) => (
                <article
                  key={name}
                  className={`rounded-[1.5rem] border bg-black/25 p-4 ${profile.borderClassName} ${profile.glowClassName}`}
                >
                  <div className={`text-xs uppercase tracking-[0.35em] ${profile.accentClassName}`}>
                    {name}
                  </div>
                  <div className="mt-2 font-serif text-2xl text-[#f7ebc8]">{profile.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.72)]">
                    {profile.description}
                  </p>
                </article>
              ))}
            </div>
          </aside>

          <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="flex min-h-[65vh] flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">
                  Live Council Transcript
                </div>
                {isStreaming ? (
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[rgba(243,231,192,0.6)]">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {activePrompt ? "Deliberation in progress" : "Streaming"}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[rgba(214,162,79,0.22)] bg-black/20 p-6 text-sm leading-7 text-[rgba(243,231,192,0.68)]">
                    Submit the first brief to convene the council. Metis will open the meeting,
                    the selected members will answer in sequence, and Orion can interrupt with a
                    new direction while the discussion is still live.
                  </div>
                ) : (
                  messages.map((entry) => {
                    const visuals = getMessageVisuals(entry);
                    return (
                      <div key={entry.id} className={`flex w-full flex-col ${visuals.alignClassName}`}>
                        <article
                          className={`w-full max-w-3xl rounded-[1.5rem] border p-4 shadow-[0_0_32px_rgba(0,0,0,0.18)] ${visuals.containerClassName}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className={`text-xs uppercase tracking-[0.32em] ${visuals.accentClassName}`}>
                                {entry.speakerName}
                              </div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.26em] text-[rgba(243,231,192,0.48)]">
                                {visuals.metaLabel}
                              </div>
                            </div>
                            {entry.role !== "user" ? (
                              <div className="text-right text-[11px] uppercase tracking-[0.24em] text-[rgba(214,162,79,0.72)]">
                                {typeof entry.confidence === "number" ? (
                                  <div>Confidence {Math.round(entry.confidence * 100)}%</div>
                                ) : null}
                                {entry.recommendedAction ? (
                                  <div className="mt-1">
                                    Action {formatRecommendedAction(entry.recommendedAction)}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <p className="mt-3 text-sm leading-7 text-[rgba(247,236,209,0.94)]">
                            {entry.content}
                          </p>
                          {entry.summaryRationale ? (
                            <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.68)]">
                              {entry.summaryRationale}
                            </p>
                          ) : null}
                        </article>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>

              <form
                onSubmit={handleSubmit}
                className="mt-2 rounded-[1.75rem] border border-[rgba(214,162,79,0.18)] bg-black/20 p-4"
              >
                <label
                  htmlFor="council-brief"
                  className="text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.75)]"
                >
                  {isStreaming ? "Interject now" : "New brief"}
                </label>
                <textarea
                  id="council-brief"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={
                    isStreaming
                      ? "Interrupt the room with a correction, challenge, or new instruction for Orion's council."
                      : "Ask the council to debate a strategy, architecture, campaign, or product decision."
                  }
                  className="mt-3 min-h-28 w-full resize-none rounded-[1.2rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-4 text-sm leading-7 text-[#f7ebc8] placeholder:text-[rgba(214,162,79,0.42)]"
                />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-6 text-[rgba(243,231,192,0.62)]">
                    The transcript now behaves like a live room. Orion’s message appears
                    immediately, each council response arrives incrementally, and you can stop the
                    current run before sending a redirect.
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isStreaming ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(214,162,79,0.26)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6e7be] transition hover:border-[rgba(214,162,79,0.46)]"
                      >
                        <Square className="h-4 w-4" />
                        Stop run
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void submitMessage(message);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d6a24f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#140d05] transition hover:bg-[#e0b163]"
                    >
                      <SendHorizontal className="h-4 w-4" />
                      {isStreaming ? "Send interjection" : "Convene council"}
                    </button>
                  </div>
                </div>
                {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
              </form>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
