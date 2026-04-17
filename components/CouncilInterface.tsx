"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  LogOut,
  Search,
  SendHorizontal,
  Shield,
  Square,
  Users,
} from "lucide-react";
import type {
  MetisAgentName,
  MetisCouncilTurn,
  MetisRecommendedAction,
  MetisSessionInsight,
  MetisSessionPreview,
  MetisUserAdminRecord,
} from "@/shared/metis";
import { metisAgentProfiles } from "@/shared/metis";
import CouncilTurnCard from "@/components/CouncilTurnCard";

type Props = {
  initialSessionId?: string;
  initialTurns: MetisCouncilTurn[];
  initialSessions: MetisSessionPreview[];
  initialUsers: MetisUserAdminRecord[];
  username: string;
  userRole: "user" | "admin";
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

type HistoryPayload = {
  sessions: MetisSessionPreview[];
  turns: MetisCouncilTurn[];
  insights: MetisSessionInsight[];
};

function formatRecommendedAction(action?: MetisRecommendedAction) {
  if (!action) return null;
  return action.replaceAll("_", " ");
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString();
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

export default function CouncilInterface({
  initialSessionId,
  initialTurns,
  initialSessions,
  initialUsers,
  username,
  userRole,
}: Props) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [messages, setMessages] = useState<LiveCouncilMessage[]>(() => flattenTurns(initialTurns));
  const [historyTurns, setHistoryTurns] = useState<MetisCouncilTurn[]>(initialTurns);
  const [historySessions, setHistorySessions] = useState<MetisSessionPreview[]>(initialSessions);
  const [insights, setInsights] = useState<MetisSessionInsight[]>([]);
  const [adminUsers, setAdminUsers] = useState<MetisUserAdminRecord[]>(initialUsers);
  const [message, setMessage] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isAdminSaving, setIsAdminSaving] = useState<number | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", name: "", email: "", role: "user" as "user" | "admin" });
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

  const hasLiveSession = useMemo(
    () => Boolean(sessionId) && messages.length > 0,
    [sessionId, messages.length],
  );

  const councilStatus = useMemo(() => {
    if (isStreaming) return "Council is speaking live";
    if (!hasLiveSession) return "Awaiting the first brief";
    return "Council ready for Orion redirect";
  }, [hasLiveSession, isStreaming]);

  const activeSessionPreview = useMemo(
    () => historySessions.find((entry) => entry.sessionId === sessionId) ?? null,
    [historySessions, sessionId],
  );

  const loadHistory = async (query?: string, targetSessionId?: string) => {
    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const params = new URLSearchParams();
      if (query?.trim()) params.set("q", query.trim());
      if (targetSessionId) params.set("session", targetSessionId);
      const response = await fetch(`/api/history?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Could not load council history.");
      }
      const payload = (await response.json()) as HistoryPayload;
      setHistorySessions(payload.sessions);
      setInsights(payload.insights);
      if (targetSessionId) {
        setHistoryTurns(payload.turns);
        setMessages(flattenTurns(payload.turns));
        setSessionId(targetSessionId);
      }
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "Could not load council history.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (initialSessionId) {
      void loadHistory(undefined, initialSessionId);
      return;
    }
    void loadHistory();
  }, []);

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
      if (sessionId) {
        await loadHistory(historyQuery, sessionId);
      }
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

  const handleHistorySearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadHistory(historyQuery, sessionId);
  };

  const handleSelectSession = async (nextSessionId: string) => {
    await loadHistory(historyQuery, nextSessionId);
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHistoryError(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        throw new Error("Could not create the user.");
      }
      const payload = (await response.json()) as { users: MetisUserAdminRecord[] };
      setAdminUsers(payload.users);
      setNewUser({ username: "", password: "", name: "", email: "", role: "user" });
    } catch (saveError) {
      setHistoryError(saveError instanceof Error ? saveError.message : "Could not create the user.");
    }
  };

  const updateUser = async (userId: number, patch: Partial<Pick<MetisUserAdminRecord, "role" | "isActive">>) => {
    setIsAdminSaving(userId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        throw new Error("Could not update that user.");
      }
      const payload = (await response.json()) as { users: MetisUserAdminRecord[] };
      setAdminUsers(payload.users);
    } catch (saveError) {
      setHistoryError(saveError instanceof Error ? saveError.message : "Could not update that user.");
    } finally {
      setIsAdminSaving(null);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(214,162,79,0.12),transparent_24%),linear-gradient(180deg,#060606,#090705)] px-4 py-6 text-[#f4e7c5] md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] border border-[rgba(214,162,79,0.22)] bg-[rgba(10,8,6,0.82)] p-5 shadow-[0_0_40px_rgba(214,162,79,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-[rgba(214,162,79,0.78)]">METIS Council</p>
              <h1 className="mt-3 font-serif text-5xl text-[#f6e7be]">Intelligence. Strategy. Execution.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[rgba(243,231,192,0.76)]">
                Welcome, {username}. The live council now sits inside a larger workspace: you can continue the current room,
                reopen prior sessions, search transcript history, review reusable insights, and administer approved users.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-[rgba(214,162,79,0.22)] px-4 py-2 text-xs uppercase tracking-[0.35em] text-[rgba(243,231,192,0.72)]">
                {councilStatus}
              </div>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(214,162,79,0.22)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f4e7c5] transition hover:border-[rgba(214,162,79,0.4)]"
                >
                  <LogOut className="h-4 w-4" />
                  Exit
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.8fr_1.05fr]">
          <aside className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">Council Members</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Object.entries(metisAgentProfiles).map(([name, profile]) => (
                <article
                  key={name}
                  className={`rounded-[1.5rem] border bg-black/25 p-4 ${profile.borderClassName} ${profile.glowClassName}`}
                >
                  <div className={`text-xs uppercase tracking-[0.35em] ${profile.accentClassName}`}>{name}</div>
                  <div className="mt-2 font-serif text-2xl text-[#f7ebc8]">{profile.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.72)]">{profile.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-[rgba(214,162,79,0.18)] bg-black/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.72)]">
                <Search className="h-4 w-4" />
                Session history
              </div>
              <form onSubmit={handleHistorySearch} className="mt-4 space-y-3">
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Search sessions, summaries, or transcript text"
                  className="w-full rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8] placeholder:text-[rgba(214,162,79,0.42)]"
                />
                <button
                  type="submit"
                  className="w-full rounded-full border border-[rgba(214,162,79,0.2)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6e7be] transition hover:border-[rgba(214,162,79,0.42)]"
                >
                  {isHistoryLoading ? "Searching" : "Search history"}
                </button>
              </form>
              <div className="mt-4 space-y-3">
                {historySessions.map((entry) => (
                  <button
                    key={entry.sessionId}
                    type="button"
                    onClick={() => void handleSelectSession(entry.sessionId)}
                    className={`w-full rounded-[1.2rem] border p-3 text-left transition ${entry.sessionId === sessionId ? "border-[rgba(214,162,79,0.42)] bg-[rgba(214,162,79,0.08)]" : "border-[rgba(214,162,79,0.12)] bg-black/20 hover:border-[rgba(214,162,79,0.3)]"}`}
                  >
                    <div className="text-xs uppercase tracking-[0.28em] text-[rgba(214,162,79,0.72)]">{entry.turnCount} turns</div>
                    <div className="mt-2 text-sm font-semibold text-[#f7ebc8]">{entry.title}</div>
                    <p className="mt-2 text-xs leading-6 text-[rgba(243,231,192,0.68)]">{entry.matchedText ?? entry.summary ?? "No summary yet."}</p>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[rgba(243,231,192,0.48)]">{formatTimestamp(entry.updatedAt)}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="flex min-h-[65vh] flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">Live Council Transcript</div>
                  {activeSessionPreview ? (
                    <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.68)]">{activeSessionPreview.summary ?? "This session summary will appear after Metis synthesises."}</p>
                  ) : null}
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
                    Submit the first brief to convene the council. Metis will open the meeting, the selected members will answer in sequence, and Orion can redirect the room while it is still live.
                  </div>
                ) : (
                  messages.map((entry) => {
                    const visuals = getMessageVisuals(entry);
                    return (
                      <div key={entry.id} className={`flex w-full flex-col ${visuals.alignClassName}`}>
                        <article className={`w-full max-w-3xl rounded-[1.5rem] border p-4 shadow-[0_0_32px_rgba(0,0,0,0.18)] ${visuals.containerClassName}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className={`text-xs uppercase tracking-[0.32em] ${visuals.accentClassName}`}>{entry.speakerName}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.26em] text-[rgba(243,231,192,0.48)]">{visuals.metaLabel}</div>
                            </div>
                            {entry.role !== "user" ? (
                              <div className="text-right text-[11px] uppercase tracking-[0.24em] text-[rgba(214,162,79,0.72)]">
                                {typeof entry.confidence === "number" ? <div>Confidence {Math.round(entry.confidence * 100)}%</div> : null}
                                {entry.recommendedAction ? <div className="mt-1">Action {formatRecommendedAction(entry.recommendedAction)}</div> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[rgba(247,236,209,0.94)]">{entry.content}</div>
                          {entry.summaryRationale ? <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.68)]">{entry.summaryRationale}</p> : null}
                        </article>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>

              <form onSubmit={handleSubmit} className="mt-2 rounded-[1.75rem] border border-[rgba(214,162,79,0.18)] bg-black/20 p-4">
                <label htmlFor="council-brief" className="text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.75)]">
                  {hasLiveSession ? "Interject now" : "New brief"}
                </label>
                <textarea
                  id="council-brief"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={hasLiveSession ? "Interrupt the room with a correction, challenge, or new instruction for Orion's council." : "Ask the council to debate a strategy, architecture, campaign, or product decision."}
                  className="mt-3 min-h-28 w-full resize-none rounded-[1.2rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-4 text-sm leading-7 text-[#f7ebc8] placeholder:text-[rgba(214,162,79,0.42)]"
                />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-6 text-[rgba(243,231,192,0.62)]">The transcript behaves like a live room. Orion’s message appears immediately, each council response arrives incrementally, and you can stop the current run before sending a redirect.</div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isStreaming ? (
                      <button type="button" onClick={handleStop} className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(214,162,79,0.26)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6e7be] transition hover:border-[rgba(214,162,79,0.46)]">
                        <Square className="h-4 w-4" />
                        Stop run
                      </button>
                    ) : null}
                    <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d6a24f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#140d05] transition hover:bg-[#e0b163]">
                      <SendHorizontal className="h-4 w-4" />
                      {hasLiveSession ? "Send interjection" : "Convene council"}
                    </button>
                  </div>
                </div>
                {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
              </form>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.72)]">
                <Shield className="h-4 w-4" />
                Cross-session memory
              </div>
              <div className="mt-4 space-y-3">
                {insights.length === 0 ? (
                  <p className="text-sm leading-7 text-[rgba(243,231,192,0.68)]">As new sessions close, METIS will surface reusable summaries here so Orion can recall prior bets and tensions quickly.</p>
                ) : (
                  insights.map((entry) => (
                    <article key={entry.id} className="rounded-[1.35rem] border border-[rgba(214,162,79,0.14)] bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.28em] text-[rgba(214,162,79,0.72)]">{entry.tags.join(" · ") || "Reusable insight"}</div>
                      <div className="mt-2 font-semibold text-[#f7ebc8]">{entry.title}</div>
                      <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.72)]">{entry.insight}</p>
                      {entry.rationale ? <p className="mt-3 text-xs leading-6 text-[rgba(243,231,192,0.56)]">{entry.rationale}</p> : null}
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
              <div className="text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.72)]">Selected session transcript</div>
              <div className="mt-4 space-y-4 max-h-[28rem] overflow-y-auto pr-1">
                {historyTurns.length === 0 ? (
                  <p className="text-sm leading-7 text-[rgba(243,231,192,0.68)]">Choose a prior session from the history rail to inspect the full council turns.</p>
                ) : (
                  historyTurns.map((turn, index) => <CouncilTurnCard key={`${turn.sessionId}-${turn.createdAt}-${index}`} turn={turn} turnIndex={index} />)
                )}
              </div>
            </section>

            {userRole === "admin" ? (
              <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.72)]">
                  <Users className="h-4 w-4" />
                  User administration
                </div>
                <form onSubmit={handleCreateUser} className="mt-4 grid gap-3">
                  <input value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} placeholder="Username" className="rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8]" />
                  <input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="Display name" className="rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8]" />
                  <input value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8]" />
                  <input value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="Temporary password" type="password" className="rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8]" />
                  <select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as "user" | "admin" }))} className="rounded-full border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-3 text-sm text-[#f7ebc8]">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" className="rounded-full bg-[#d6a24f] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#140d05]">Create user</button>
                </form>
                <div className="mt-4 space-y-3">
                  {adminUsers.map((entry) => (
                    <article key={entry.id} className="rounded-[1.2rem] border border-[rgba(214,162,79,0.12)] bg-black/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#f7ebc8]">{entry.name || entry.username || `User ${entry.id}`}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.24em] text-[rgba(243,231,192,0.5)]">{entry.username ?? "No username"} · {entry.email ?? "No email"}</div>
                        </div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-[rgba(214,162,79,0.72)]">{entry.role} · {entry.isActive ? "active" : "paused"}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={isAdminSaving === entry.id} onClick={() => void updateUser(entry.id, { role: entry.role === "admin" ? "user" : "admin" })} className="rounded-full border border-[rgba(214,162,79,0.2)] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-[#f6e7be] disabled:opacity-50">Toggle role</button>
                        <button type="button" disabled={isAdminSaving === entry.id} onClick={() => void updateUser(entry.id, { isActive: !entry.isActive })} className="rounded-full border border-[rgba(214,162,79,0.2)] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-[#f6e7be] disabled:opacity-50">{entry.isActive ? "Pause access" : "Restore access"}</button>
                      </div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.24em] text-[rgba(243,231,192,0.48)]">Last sign-in {formatTimestamp(entry.lastSignedIn)}</div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {historyError ? <p className="rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{historyError}</p> : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
