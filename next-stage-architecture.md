# METIS Next-Stage Architecture

## Objective

The next implementation stage should make METIS ready for its **first real recorded operating session** by moving from a functioning live debate interface to a durable, context-aware operating system for repeated strategic discussions.

At a minimum, METIS now needs three architectural properties. First, every run should be grounded in a **company profile** that expresses stable business context. Second, every live debate should have strong **session memory** so agents can build on what has already happened in the room. Third, Orion should be able to return to prior work through **history, search, and controlled access** rather than treating each session as disposable.

## Recommended delivery order

| Order | Capability | Why it comes now |
|---|---|---|
| 1 | Company profile | Every future prompt should be grounded in stable operating context. |
| 2 | Session memory | This is required for coherent multi-turn live discussions. |
| 3 | History and transcript search | Needed for review, replay, and first-session record keeping. |
| 4 | Lightweight user administration | Access will be limited to a small invited group. |
| 5 | Cross-session learning | Valuable, but safer once session storage and search are in place. |
| 6 | Cost controls and prompt optimization | Needed to keep the council affordable as usage grows. |

## 1. Company profile layer

The application should add a new **company profile** model in Postgres and treat it as the baseline context for every council session. The profile should not be embedded ad hoc in code or copied into prompts manually. Instead, prompt construction should always fetch the latest approved profile and inject a structured summary into the chair and specialist prompts.

A sensible first schema is one row per company or workspace, plus editable sections for identity, business model, constraints, and operating posture.

| Table | Purpose | Core fields |
|---|---|---|
| `company_profiles` | Stable organization identity and operating context | `id`, `name`, `mission`, `products`, `customers`, `team_size`, `stage`, `geography`, `updated_at` |
| `company_constraints` | Hard constraints and policy boundaries | `id`, `company_profile_id`, `constraint_type`, `content`, `priority` |
| `company_priorities` | Current strategic priorities | `id`, `company_profile_id`, `title`, `content`, `priority_rank` |

The prompt builder in `lib/metisCouncil.ts` should then receive a normalized **company context block** and prepend it to all agent-visible prompt input. This keeps the specialist identities stable while ensuring their reasoning is shaped by the same mission, product landscape, risk posture, and real-world constraints.

## 2. Session memory layer

The current council persistence model already stores sessions and messages, which is a strong foundation. The next step is to make the database-backed session transcript the **authoritative memory source** for each run. The live client transcript can still exist for responsive rendering, but the server should reconstruct current-session memory from the persisted session plus the newest pending user message before each model call.

This should be implemented as an explicit memory assembly function.

| Layer | Responsibility |
|---|---|
| UI transcript | Fast local rendering and optimistic continuity |
| API route | Accept user message or Orion interjection |
| Memory assembler | Rebuild current-session context from database rows plus current in-flight turn |
| Prompt builder | Convert that memory into structured council-visible context |

This change will make refreshes, reconnects, and longer discussions much more reliable. It also prevents hidden divergence between what the browser sees and what the models see.

## 3. Cross-session learning layer

Cross-session learning should be introduced as **retrieved insight**, not raw unrestricted history dumping. The safest approach is to store curated session-level insights separately from raw message logs. That lets METIS carry forward durable lessons without forcing every new discussion to ingest entire old transcripts.

A simple first design is:

| Table | Purpose |
|---|---|
| `session_insights` | Human-readable distilled lessons from completed sessions |
| `session_tags` | Searchable labels such as product, hiring, go-to-market, architecture, pricing |
| `session_links` | Optional relationships between sessions and earlier decisions |

When Orion starts a new session, METIS can retrieve the top few relevant prior insights based on tags, similarity, or explicit user selection. Those insights should be injected as a separate prompt section called something like **Relevant prior decisions**.

## 4. History and search UI

Inside the authenticated workspace, METIS should gain a left-hand history rail or dedicated history view. Orion should be able to open previous sessions, search by title or transcript content, and continue a prior discussion from the correct session.

The minimum UI set should include:

| Feature | Description |
|---|---|
| Session list | Show recent sessions with title, date, status, and last activity |
| Transcript viewer | Load a complete prior transcript cleanly |
| Search bar | Search titles, user prompts, and agent message content |
| Continue session | Resume discussion from an existing session rather than starting a new one |

On the backend, this likely means adding indexed search-oriented columns such as session title quality improvements, optional session summary text, and either full-text search indexes or a deliberate query helper that searches `council_sessions` plus `council_messages`.

## 5. Lightweight user administration

Because access will remain intentionally small, this should not become a heavy enterprise admin system. METIS only needs a minimal admin screen for Orion or another admin to see current users and grant or revoke access.

The existing `users.role` field is already present, so the next step is primarily operational rather than conceptual. Add user list queries, invite or create-user actions, deactivate or archive access, and role editing limited to admin users.

| Capability | Minimal implementation |
|---|---|
| View users | List current users, role, last sign-in |
| Add user | Create password or invited account |
| Remove access | Soft-disable or revoke login ability |
| Role control | Toggle `user` / `admin` only |

A soft-disable field such as `is_active` would be preferable to deleting users, because session ownership and audit history should remain intact.

## 6. Cost control and model strategy

The council is already showing signs of becoming expensive. The architecture should therefore separate **reasoning quality** from **token waste**.

The first optimizations should be structural rather than purely model-based. Company context should be summarized once into a compact prompt block. Session memory should be windowed intelligently, using the most recent turns plus a maintained session summary for older context. Cross-session learning should pass only the most relevant prior insights. Finally, not every speaker needs the same prompt weight in every situation.

| Optimization | Expected effect |
|---|---|
| Compact company context block | Prevents repeated long prompt boilerplate |
| Rolling session summary | Reduces token growth in long discussions |
| Retrieved prior insights only | Avoids dumping historical transcripts into every turn |
| Adaptive speaker routing | Lets METIS skip or shorten low-value turns when appropriate |
| Cheaper model for summarization tasks | Reserves premium reasoning for high-value debate turns |

## Proposed implementation sequence in code

The most efficient next coding pass would touch the system in this order.

| Step | Files likely involved |
|---|---|
| Add schema for company profile and user activation | `drizzle/schema.ts` |
| Add migration and persistence helpers | `lib/db.ts` |
| Add prompt context assembly | `lib/metisCouncil.ts` |
| Add admin/history/search server routes or procedures | likely new server-side query layer plus existing route surfaces |
| Add authenticated UI views for history and users | `app/council/page.tsx`, `components/CouncilInterface.tsx`, plus new components |

## Immediate recommendation

The next implementation pass should focus on **company profile + session memory together**. Those two changes will do the most to improve real session quality, transcript reliability, and model discipline before further UI expansion.
