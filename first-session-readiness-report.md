# METIS First-Session Readiness Report

METIS is now materially closer to a publish-ready first live session. I verified the council path directly through the authenticated runtime instead of relying on the browser form automation, which had been misleading the verification flow. The council API now persists sessions, creates reusable session insights, and successfully reuses those insights in a fresh follow-up session when Orion asks a continuity question.

| Area | Current status | What was verified |
|---|---|---|
| **Provider routing** | Updated | Metis now targets **Claude Opus 4.7**, and Loki is routed through the **Azure-hosted Grok** configuration using `AZUREGROK42_API_KEY`, `AZUREGROK42_DEPLOYMENT`, and `AZUREGROK42_ENDPOINT`. |
| **Council workspace** | Updated | The pre-session composer is compact, the old helper copy is removed, and the focused workspace regression test passes. |
| **Cross-session recall** | Fixed and re-tested | A fresh continuity request now returns explicit prior-memory language instead of falsely claiming that no previous memory was retrieved. |
| **Test cost control** | Improved | Expensive live-provider checks were reduced, and focused Vitest coverage now protects the continuity and workspace changes. |
| **Build readiness** | Confirmed | `pnpm build` completed successfully. |

The key recall bug turned out to be more specific than the first diagnosis suggested. The underlying storage and retrieval architecture was already present, but the continuity-intent matcher was too narrow. Phrases such as **"what did we agree"** and **"previously agree"** were not being recognized reliably as recall requests, so the route skipped the recent-insight fallback even when relevant memory already existed. After broadening that matcher and tightening the prompt rules, a fresh council request returned the expected labeled recall, beginning with **"Prior memory:"** and then applying the retrieved insight to the present decision.

| Direct runtime verification | Outcome |
|---|---|
| First authenticated council run | Persisted successfully and generated reusable session insight |
| Search against history for `architecture` | Returned the newly created insight entries |
| Fresh follow-up continuity run | Surfaced prior-session memory explicitly and used it in the synthesis |
| Production build | Passed |

## Vercel Frontend Plus AWS Processing: What It Actually Means

The cleanest architecture from here is to keep **Vercel** responsible for the web application shell and move the long-running council orchestration to **AWS**. This recommendation is driven by the fact that Vercel functions remain request-scoped and are billed for total invocation duration, including time spent waiting during streaming; if a function exceeds its configured maximum duration, Vercel terminates it.[1] That model is fine for authentication, page rendering, history lookup, and light API work, but it is not the best long-term home for multi-agent runs that may expand into tool usage, retries, branching, and longer debates.

The practical split is straightforward. Vercel should keep serving the **Next.js frontend**, the authenticated session shell, and the lightweight APIs for history, users, and session metadata. AWS should own the **council execution plane**: receiving a job, running the specialist sequence, calling external tools, persisting events, and streaming progress back to the UI through a durable channel. In other words, Vercel stays the interaction layer; AWS becomes the deliberation engine.

| Layer | Recommended home | Why |
|---|---|---|
| **Frontend UI** | Vercel | Best fit for Next.js delivery, auth flow, and rapid frontend deployment |
| **Light APIs** | Vercel | Good for fast request-response endpoints such as history, users, and session metadata |
| **Long council runs** | AWS | Better fit for longer processing, queued work, retries, and tool-heavy orchestration |
| **Persistent database** | Keep current Postgres now, move later only if needed | No urgent need to migrate the data layer before moving the execution layer |

The migration does **not** require a full rewrite. The current `/api/council` route is already the seam. Today it starts the session, performs retrieval, runs the orchestration, and streams the result in one request. The next step is to refactor that route into a submission endpoint that creates a run record and hands execution to AWS. After that, the browser can subscribe to run progress rather than waiting for the entire orchestration to live inside one Vercel request.

A sensible AWS shape would be an ingress endpoint, a job queue, one or more workers, and a progress stream. Concretely, that usually means an API-facing layer that accepts the brief, a queue that decouples reception from execution, workers that run the council logic, and a channel for the browser to read incremental updates. The important point is architectural, not product-specific: the council becomes **asynchronous and durable**, rather than being trapped inside a single web request.

## Memory-Wipe Readiness Before the First Real Session

The architecture **does support wiping prior session memory safely** before the first real session. The current schema links `sessionInsights` and `councilMessages` back to `councilSessions` with cascading deletes, so deleting the relevant session rows removes the associated transcript and insight records as well. In addition, the insight refresh path already deletes and rebuilds session-level insights per session, which shows the memory layer is not structurally separate from the session container.

That means the safest operational wipe before your real first session is not a hacky prompt reset. It is a **data reset** against the session tables. The clean approach is to remove the prior `councilSessions` rows for the relevant user or environment and let the dependent `councilMessages` and `sessionInsights` records cascade away with them. The user table and application code can remain untouched.

| Wipe objective | Safe method |
|---|---|
| **Remove all historical council memory before first session** | Delete old `councilSessions` records in the target environment and rely on cascade deletes for transcript and insight tables |
| **Keep login/users intact** | Do not delete from `users`; clear only council-session data |
| **Preserve code and configuration** | No code rollback required; this is a data operation |

The one caution is procedural rather than architectural. Because the database is not recoverable by magic after destructive SQL, the wipe should be done only after you are satisfied with recall behavior and ideally after exporting anything you still want to keep. Structurally, however, the architecture is ready for that wipe.

## Recommendation

METIS is now in a state where you can reasonably move toward publishing this iteration. The most important runtime issue from today—the false "no prior memory" response for continuity questions—has been fixed and re-tested. The remaining meaningful work is not about basic viability; it is about operational polish, especially the broader AWS execution migration and any optional end-to-end browser refinements you still want before the first public session.

## References

[1]: https://vercel.com/docs/functions/configuring-functions/duration "Configuring Maximum Duration for Vercel Functions"
