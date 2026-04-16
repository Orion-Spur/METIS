"use client";

import { useMemo, useState, useTransition } from "react";
import { LogOut, SendHorizontal } from "lucide-react";
import type { MetisCouncilTurn } from "@/shared/metis";
import { metisAgentProfiles } from "@/shared/metis";

type Props = {
  initialSessionId?: string;
  initialTurns: MetisCouncilTurn[];
  username: string;
};

export default function CouncilInterface({ initialSessionId, initialTurns, username }: Props) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [turns, setTurns] = useState(initialTurns);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const councilStatus = useMemo(() => {
    if (isPending) return "Council is deliberating";
    if (turns.length === 0) return "Awaiting the first brief";
    return "Council is active";
  }, [isPending, turns.length]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/council", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: trimmedMessage,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "The council could not process that request." }));
        setError(payload.error ?? "The council could not process that request.");
        return;
      }

      const payload = await response.json();
      setTurns((current) => [...current, payload.turn]);
      setSessionId(payload.sessionId);
      setMessage("");
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(214,162,79,0.12),transparent_24%),linear-gradient(180deg,#060606,#090705)] px-4 py-6 text-[#f4e7c5] md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] border border-[rgba(214,162,79,0.22)] bg-[rgba(10,8,6,0.82)] p-5 shadow-[0_0_40px_rgba(214,162,79,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-[rgba(214,162,79,0.78)]">METIS Council</p>
              <h1 className="mt-3 font-serif text-5xl text-[#f6e7be]">Intelligence. Strategy. Execution.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[rgba(243,231,192,0.76)]">
                Welcome, {username}. Metis orchestrates the council while Athena frames strategy, Argus examines evidence, and Loki pressure-tests the reasoning.
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

        <section className="grid gap-4 xl:grid-cols-[1.1fr_2.2fr]">
          <aside className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">Council Members</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Object.entries(metisAgentProfiles).map(([name, profile]) => (
                <article key={name} className={`rounded-[1.5rem] border bg-black/25 p-4 ${profile.borderClassName} ${profile.glowClassName}`}>
                  <div className={`text-xs uppercase tracking-[0.35em] ${profile.accentClassName}`}>{name}</div>
                  <div className="mt-2 font-serif text-2xl text-[#f7ebc8]">{profile.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[rgba(243,231,192,0.72)]">{profile.description}</p>
                </article>
              ))}
            </div>
          </aside>

          <section className="rounded-[2rem] border border-[rgba(214,162,79,0.2)] bg-[rgba(9,8,6,0.82)] p-5">
            <div className="flex min-h-[55vh] flex-col gap-4">
              <div className="text-xs uppercase tracking-[0.4em] text-[rgba(214,162,79,0.75)]">Council Transcript</div>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {turns.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[rgba(214,162,79,0.22)] bg-black/20 p-6 text-sm leading-7 text-[rgba(243,231,192,0.68)]">
                    Submit the first brief to convene the council. The response format is structured so each turn records confidence, recommended action, and summary rationale.
                  </div>
                ) : (
                  turns.map((turn, index) => (
                    <article key={`${turn.sessionId}-${turn.createdAt}-${index}`} className="rounded-[1.75rem] border border-[rgba(214,162,79,0.16)] bg-black/20 p-5">
                      <div className="rounded-[1.35rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(214,162,79,0.06)] p-4">
                        <div className="text-xs uppercase tracking-[0.32em] text-[rgba(214,162,79,0.75)]">User brief</div>
                        <p className="mt-3 text-sm leading-7 text-[rgba(249,239,212,0.92)]">{turn.userMessage}</p>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        {turn.outputs.map((output) => {
                          const profile = metisAgentProfiles[output.agentName];
                          return (
                            <section key={`${turn.createdAt}-${output.agentName}`} className={`rounded-[1.35rem] border bg-[rgba(12,10,8,0.9)] p-4 ${profile.borderClassName}`}>
                              <div className={`text-xs uppercase tracking-[0.32em] ${profile.accentClassName}`}>{output.agentName}</div>
                              <p className="mt-3 text-sm leading-7 text-[rgba(247,236,209,0.9)]">{output.content}</p>
                              <dl className="mt-4 space-y-2 text-xs uppercase tracking-[0.26em] text-[rgba(214,162,79,0.75)]">
                                <div className="flex items-center justify-between gap-4">
                                  <dt>Confidence</dt>
                                  <dd>{Math.round(output.confidence * 100)}%</dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <dt>Action</dt>
                                  <dd>{output.recommendedAction.replaceAll("_", " ")}</dd>
                                </div>
                              </dl>
                              <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.65)]">{output.summaryRationale}</p>
                            </section>
                          );
                        })}
                      </div>

                      <section className={`mt-4 rounded-[1.5rem] border bg-[rgba(14,10,6,0.94)] p-5 ${metisAgentProfiles.Metis.borderClassName}`}>
                        <div className={`text-xs uppercase tracking-[0.35em] ${metisAgentProfiles.Metis.accentClassName}`}>Metis synthesis</div>
                        <p className="mt-3 text-sm leading-7 text-[rgba(249,239,212,0.95)]">{turn.synthesis.content}</p>
                        <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.28em] text-[rgba(214,162,79,0.76)]">
                          <span>Confidence {Math.round(turn.synthesis.confidence * 100)}%</span>
                          <span>Action {turn.synthesis.recommendedAction.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.7)]">{turn.synthesis.summaryRationale}</p>
                      </section>
                    </article>
                  ))
                )}
              </div>

              <form onSubmit={handleSubmit} className="mt-2 rounded-[1.75rem] border border-[rgba(214,162,79,0.18)] bg-black/20 p-4">
                <label htmlFor="council-brief" className="text-xs uppercase tracking-[0.35em] text-[rgba(214,162,79,0.75)]">
                  New brief
                </label>
                <textarea
                  id="council-brief"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ask the council to debate a strategy, architecture, campaign, or product decision."
                  className="mt-3 min-h-32 w-full resize-none rounded-[1.2rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(4,4,4,0.72)] px-4 py-4 text-sm leading-7 text-[#f7ebc8] placeholder:text-[rgba(214,162,79,0.42)]"
                />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-6 text-[rgba(243,231,192,0.62)]">
                    Each council turn records the specialist responses and the final synthesis for later persistence and AWS migration.
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d6a24f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#140d05] transition hover:bg-[#e0b163] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <SendHorizontal className="h-4 w-4" />
                    {isPending ? "Deliberating" : "Convene council"}
                  </button>
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
