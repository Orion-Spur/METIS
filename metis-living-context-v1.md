# METIS Living Context v1

## Purpose

This document is the working context record for **METIS**. It is intended to help future work resume quickly by describing what the project currently is, how it is built, how it behaves in production and development, what architectural decisions have already been made, and what remains open. It should be updated whenever the architecture, deployment path, data model, or operating assumptions materially change. [1] [2] [3]

## Current Product Definition

METIS is a **secure, cinematic Next.js web application** that provides a password-protected workspace for a four-member AI council composed of **Metis, Athena, Argus, and Loki**. The current release is explicitly positioned as a **Vercel-first** deployment backed by **Neon PostgreSQL** for authentication and persistent council history. The public surface is intentionally minimal: a one-screen black login homepage leads into a protected council workspace where Orion can brief the room, watch responses stream in sequence, and interject during an active run. [1] [3] [4] [5] [8]

| Area | Current state |
|---|---|
| Frontend framework | Next.js App Router with React 19 [3] |
| Styling system | Tailwind CSS 4 with a dark premium visual language [3] [8] |
| Persistence | Neon/PostgreSQL via Drizzle ORM and `postgres` [1] [3] [4] |
| Auth model | Database-backed username/password login with JWT cookie sessions [1] [5] [10] |
| Runtime debate model | Multi-turn chaired discussion led by Metis, then final synthesis [7] |
| Live transport | NDJSON streaming from `/api/council` [8] |
| Testing | Vitest suites for auth, DB, council orchestration, streaming route, and live provider validation [3] |

## System Architecture

The application is now a **true Next.js application** rather than the earlier mixed foundation. The public entry route is `app/page.tsx`, which renders the image-led login composition and posts credentials to the login route. The protected route is `app/council/page.tsx`, which verifies session state server-side, loads any persisted transcript for the requested session, and hydrates the main council interface. The client-side workspace lives in `components/CouncilInterface.tsx`, while the two principal backend cores are `lib/db.ts` for persistence and `lib/metisCouncil.ts` for prompt assembly and orchestration. [1] [4] [7] [8] [9]

| Layer | Key files | Responsibility |
|---|---|---|
| Public entry | `app/page.tsx`, `app/api/auth/login/route.ts` | Show login UI, accept credentials, redirect into authenticated workspace [9] [10] |
| Protected council page | `app/council/page.tsx` | Gate access and preload session history for the council UI [11] |
| Interactive council UI | `components/CouncilInterface.tsx`, `shared/metis.ts` | Render roster, transcript, streaming updates, interjection controls, and message metadata [6] [8] |
| Streaming API | `app/api/council/route.ts` | Validate request, load authoritative history, stream events, persist each message [8] |
| Orchestration core | `lib/metisCouncil.ts` | Build prompts, enforce turn order, compress outputs, and drive the chaired discussion [7] |
| Persistence core | `lib/db.ts`, `drizzle/schema.ts` | Manage users, company profile, sessions, messages, and transcript reconstruction [4] [5] |
| Configuration | `lib/env.ts`, `package.json` | Resolve environment variables, model defaults, scripts, and package stack [3] [6] |

## User Journey and Runtime Flow

The current user journey is intentionally narrow. Orion lands on a black login page with the METIS artwork and submits a username and password through a normal HTML form. The login route validates the credentials against the `users` table, signs an HTTP-only secure session cookie named `metis_session`, and redirects to `/council`. If the credentials are wrong, the user is redirected back to `/` with an error query parameter. If `JWT_SECRET` is missing or too short, the route redirects with an `auth_not_configured` error rather than crashing the deployment. [5] [9] [10]

Inside `/council`, the page loads the current server session and optionally preloads an existing session transcript. The client then manages the live conversation. When Orion submits a new message, the interface immediately appends the Orion card locally, calls `/api/council`, and begins consuming **newline-delimited JSON** events from the response stream. The UI handles `start`, `message`, `complete`, and `error` events, adds each streamed discussion or synthesis message to the transcript as it arrives, and exposes abort/interjection controls during active runs. [8] [11]

| Step | Runtime behavior |
|---|---|
| 1 | Orion logs in from the public homepage [9] [10] |
| 2 | Server issues a signed `metis_session` JWT cookie [5] [10] |
| 3 | `/council` loads persisted turns for the selected session if one exists [11] [4] |
| 4 | Orion submits a brief or interjection from the council interface [8] |
| 5 | `/api/council` starts a new user turn in the database before orchestration begins [8] [4] |
| 6 | The orchestration layer streams discussion messages and final synthesis incrementally [7] [8] |
| 7 | Each streamed message is persisted to `councilMessages` and then emitted to the browser [8] [4] |
| 8 | The run ends with a `complete` event or an `error` event [8] |

## Authentication and Security Model

METIS no longer relies on environment-defined login credentials. Instead, it uses **database-backed password authentication**. Passwords are stored as scrypt hashes, and credential checks use timing-safe comparisons. Successful login records update `lastSignedIn`, and sessions are signed as HS256 JWTs containing `userId`, `username`, `role`, and a derived fingerprint claim. The cookie is HTTP-only, `sameSite=lax`, `secure`, and valid for twelve hours. Protected server routes determine access by reading and verifying this cookie. [1] [5] [10] [11]

The notable operational caveat is that `JWT_SECRET` remains optional at parse time but mandatory at sign/verify time. That choice allows the homepage to stay online even if auth has not been configured yet, while still refusing to issue sessions until the secret is properly set. This was a deliberate hardening decision to avoid deployment crashes from missing auth secrets. [1] [5] [6] [10]

| Security element | Current implementation |
|---|---|
| Password storage | Scrypt hashes generated and verified in `lib/auth.ts` [5] |
| Session token | HS256 JWT signed with `JWT_SECRET` [5] |
| Session transport | HTTP-only secure cookie `metis_session` [5] [10] |
| Auth source of truth | `users` table in PostgreSQL [4] [5] |
| Route protection | Server-side `getCurrentSession()` checks on protected routes and API endpoints [5] [8] [11] |

## Data Model and Persistence

The current PostgreSQL schema consists of four active entities: `users`, `companyProfiles`, `councilSessions`, and `councilMessages`. The `users` table stores identity, login method, role, timestamps, and the password hash. The `companyProfiles` table stores a durable business-context record that can be injected into prompts. `councilSessions` represents the long-lived container for a discussion, while `councilMessages` stores each user prompt, each specialist turn, and each synthesis as a separate ordered row. [1] [4]

Persistence is implemented through Drizzle over `postgres`. The DB layer lazily instantiates the client, derives the runtime database URL from `METIS_DATABASE_URL ?? DATABASE_URL`, and reconstructs higher-level turns by grouping ordered message rows around each user entry. This means the browser transcript is not the authority; the database transcript is. The app can therefore recover session continuity by reloading the stored rows and rebuilding turns deterministically. [4] [6]

| Table | Important fields | Why it matters |
|---|---|---|
| `users` | `username`, `passwordHash`, `role`, `lastSignedIn` | Supports DB-backed login and limited role separation [4] |
| `companyProfiles` | `name`, `mission`, `products`, `constraints`, `operatingModel` | Grounds prompt context in stable business facts [4] |
| `councilSessions` | `id`, `userId`, `status`, `lastMessageAt` | Owns session containers and recency ordering [4] |
| `councilMessages` | `sessionId`, `sequenceOrder`, `role`, `agentName`, `content`, `confidence`, `recommendedAction`, `summaryRationale` | Stores the full council transcript at message granularity [4] |

## Company Context Layer

The project has already moved beyond a generic chat shell by introducing a **company context** layer. The staged source dataset currently describes **Calling All Minds**, its mission, products, customer base, operating model, founder expectations, and first-session objectives. The live orchestration layer reads the `companyProfiles` record and builds a structured prompt block that is prepended to agent-visible context. When no company profile exists, the orchestration explicitly tells the models not to invent business facts. [4] [7] [12]

This design matters because METIS is not intended to remain a free-floating reasoning toy. It is being shaped as an internal intelligence system whose advice should be grounded in stable business reality. The JSON staging file documents the original approved content, while the database schema and DB helpers define the durable runtime mechanism for storing and retrieving that context. [4] [7] [12]

## Council Orchestration Model

The core council design is a **chaired, multi-turn discussion**, not a one-shot ensemble response. `lib/metisCouncil.ts` defines a fixed nine-step plan: Metis opens the room, Athena responds, Argus tests assumptions, Loki pressure-tests the weak points, Metis reframes at the midpoint, the three specialists each respond again, and Metis delivers the final synthesis. The plan explicitly blocks synthesis until a full challenge round has occurred and Loki has delivered the required pressure. [7]

The prompt architecture has also been refined away from rigid role labels. Athena, Argus, and Loki are described by their behaviors and contributions rather than static titles, while Metis remains the named chair. The latest formatting direction favors concise natural prose with optional bullets, rather than explicit `Position`, `Key Reasoning`, and `Challenge` headers in every turn. Argus is instructed to use numbers, thresholds, or concrete examples when challenging; Loki is instructed to name likely consequences; and Metis is instructed to advance the room, narrow the choice, or force a response at the end of each intervention. [7] [13]

| Agent | Current orchestration posture | Model routing |
|---|---|---|
| Metis | Chairs the room, reframes, contributes ideas, and closes with synthesis [7] | Anthropic model configured via `ANTHROPIC_MODEL` [6] |
| Athena | Clarifies direction, sequencing, and workable paths [7] [13] | Azure OpenAI deployment configured by endpoint and deployment variables [1] [6] |
| Argus | Tests evidence and sharpens proof standards, now visually purple [7] [13] | Gemini model configured via `GEMINI_MODEL` [6] |
| Loki | Stress-tests logic, exposes failure modes, and applies required pressure, now visually green [7] [13] | xAI model configured via `XAI_MODEL` [6] |

## Output Discipline and Message Shape

Council outputs are not free-form blobs. The shared message contract requires each agent message to carry `content`, `confidence`, `recommendedAction`, `summaryRationale`, and `sequenceOrder`. The orchestration module further constrains message size through word limits on position, reasoning, challenge, and summary content, while the UI surfaces confidence, recommended action, and rationale in each rendered card. This is one of the project’s defining characteristics: transcript entries are meant to be compact, inspectable decision objects rather than long essays. [7] [13]

## Streaming and Abort Handling

The council API route streams all output as NDJSON and persists each agent message before sending it to the browser. The route treats persisted session history as authoritative and only falls back to client-provided `liveContext` when no server history exists for the requested session. The implementation also contains explicit protections for reader-abort races: it tracks a local `closed` flag, stops enqueueing when the request is aborted, and guards against double-close errors on the stream controller. [8]

This logic exists because the project previously hit a failure mode where a closed stream controller could still receive enqueue attempts after abort. The browser verification notes and focused route tests both confirm that this area became a real operational concern and was addressed directly rather than being treated as a cosmetic edge case. [8] [14] [15]

## Frontend Experience and Visual System

The public homepage is intentionally sparse and image-first. It uses a fixed CloudFront-hosted METIS artwork asset, a black background, gold accenting, and a centered two-field login form. The authenticated council page expands that language into a more cinematic control room with roster cards, gold framing, translucent dark panels, and distinct accents per agent. Metis retains the primary gold accent, Athena is blue, Argus is purple, and Loki is green. [9] [13]

The council interface is designed around **live sequential visibility**. Orion’s own message appears immediately, the council status label reflects whether the room is waiting or speaking, and active runs swap the normal composer state into an interjection-oriented mode. This is not a generic chatbot shell; it is a staged deliberation interface intended to make the room feel active and inspectable while preserving a premium aesthetic. [8] [13] [14]

## Environment and Deployment Model

The runtime configuration is centralized in `lib/env.ts`. The application expects a database URL, `JWT_SECRET`, provider secrets for Anthropic, Azure, Gemini, and xAI, plus Azure endpoint and deployment metadata. The default model identifiers currently resolve to `claude-opus-4-6`, `gemini-3.1-pro-preview`, and `grok-4.20-0309-reasoning`, while Athena depends on the configured Azure deployment name rather than a model string alone. The package scripts support local dev, build, type checking, tests, and Drizzle migration generation. [1] [3] [6]

The intended deployment target is Vercel. The documented production checklist requires setting `JWT_SECRET`, pointing `METIS_DATABASE_URL` at Neon, confirming the core tables exist, seeding the admin user, and validating with `pnpm test` and `pnpm build` before shipping. The README is explicit that the current application is a Vercel-first delivery layer and that longer-running orchestration may later move behind AWS infrastructure while preserving the current web interface. [1] [2]

| Variable or setting | Operational purpose |
|---|---|
| `METIS_DATABASE_URL` | Preferred Neon runtime connection string [1] [6] |
| `DATABASE_URL` | Fallback database URL if no METIS override is present [1] [6] |
| `JWT_SECRET` | Required for signing and verifying session cookies [1] [5] [6] |
| `ANTHROPIC_API_KEY` | Enables Metis model calls [1] [6] |
| `AZUREGPT54_API_KEY`, `AZUREGPT54_ENDPOINT`, `AZUREGPT54_DEPLOYMENT` | Enable Athena routing through Azure [1] [6] |
| `GEMINI_API_KEY` | Enables Argus model calls [1] [6] |
| `XAI_API_KEY` | Enables Loki model calls [1] [6] |

## Development History and Architectural Evolution

The project has already gone through several important architectural phases. It began as a broader rebuild, then replaced its earlier non-Next.js base with a clean Next.js structure. It moved from a MySQL-style path toward PostgreSQL and ultimately standardized on Neon. It also evolved from environment-based login toward DB-backed authentication, and from a one-shot council answer into a streamed, chaired, multi-turn deliberation model with persistent transcript history. The README and stage-architecture notes show that the project has been deliberately sequenced rather than built as a single pass. [1] [2] [4] [7]

A second major thread in the project history is the movement from a generic AI council toward a domain-grounded internal system. The company-context dataset for Calling All Minds, the company profile table, and the prompt-injection flow all mark that shift. The council is increasingly meant to reason from real company constraints, real products, and founder decision preferences rather than abstract prompts alone. [4] [7] [12]

## Verified Operational State

The available verification notes indicate that the login flow works, the protected council page loads correctly, the live production page on `metis.ooo` reflects the streaming council UI, and the interjection workflow has been observed working in production. The notes also distinguish a past browser-automation quirk from actual product behavior: one earlier issue was not a real submission regression but an automation problem interacting with the React-controlled textarea. That distinction is important context for future debugging, because the browser tooling may occasionally misrepresent live behavior on this interface. [14]

The codebase also contains a broad Vitest surface, including route tests, orchestration tests, authentication tests, DB tests, and live provider credential checks. That does not make the system finished, but it does mean the project already values test-backed behavior in the more failure-prone areas: auth, streaming, persistence, and provider wiring. [3] [15]

## Known Gaps and Next Architectural Priorities

The next-stage architecture notes remain the clearest statement of what is still missing. The biggest unfinished capabilities are **cross-session learning**, **history and search**, and **lightweight user administration**. The intended order is deliberate: company profile first, session memory second, then history/search, then limited admin, then cross-session learning. This sequence reflects a view that durable current-session quality matters before broader retrieval or governance layers. [2]

There is also an important distinction in how future memory should work. The notes argue that cross-session learning should not mean dumping raw historical transcripts into every new prompt. Instead, METIS should store curated session-level insights and retrieve only relevant prior decisions when starting new work. That is both a token-efficiency choice and a governance choice. [2]

| Outstanding area | Intended direction |
|---|---|
| Cross-session learning | Store curated insights and retrieve relevant prior lessons rather than raw transcript dumps [2] |
| History and search | Add session list, transcript viewer, search, and resume-session workflow inside the authenticated workspace [2] |
| User administration | Add lightweight admin tooling for viewing users, granting access, and revoking access without heavy enterprise overhead [2] |
| Cost control | Introduce rolling summaries, compact context blocks, retrieved insights, and adaptive speaker routing [2] |

## Practical Guidance for Future Work

Future changes should preserve a few core assumptions unless there is a deliberate decision to overturn them. First, the council transcript in PostgreSQL is the authoritative memory source. Second, the public homepage should remain minimal unless there is a product-level decision to broaden the marketing layer. Third, the orchestration should remain inspectable and structured, with each message carrying action and rationale metadata. Fourth, company context should enter prompts through a maintained data layer, not through ad hoc string patches in prompt text. [4] [7] [8] [9] [12]

If the project expands, the cleanest next workstream is to keep the current Next.js/Vercel interface but deepen the internal operating model: better session retrieval, better admin controls, and carefully governed cross-session memory. That path is already consistent with the current schema, DB helpers, prompt builder, and route structure. [2] [4] [7] [8]

## References

[1]: ./README.md "METIS README"
[2]: ./next-stage-architecture.md "METIS Next Stage Architecture"
[3]: ./package.json "METIS package.json"
[4]: ./drizzle/schema.ts "METIS Drizzle Schema"
[5]: ./lib/auth.ts "METIS Authentication Module"
[6]: ./lib/env.ts "METIS Environment Configuration"
[7]: ./lib/metisCouncil.ts "METIS Council Orchestration"
[8]: ./app/api/council/route.ts "METIS Council API Route"
[9]: ./app/page.tsx "METIS Public Homepage"
[10]: ./app/api/auth/login/route.ts "METIS Login Route"
[11]: ./app/council/page.tsx "METIS Protected Council Page"
[12]: ./company-context-staging-v1.json "METIS Company Context Staging Data"
[13]: ./shared/metis.ts "METIS Shared Types and Agent Profiles"
[14]: ./browser-verification-notes.txt "METIS Browser Verification Notes"
[15]: ./tests/councilRoute.test.ts "METIS Council Route Tests"
