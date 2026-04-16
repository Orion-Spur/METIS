# METIS

**METIS** is a secure, cinematic **Next.js** web application for running a four-agent AI council session. The current release is designed for **Vercel deployment** while using **Neon PostgreSQL** for authentication and council-history persistence.

## Current Product Scope

METIS currently includes a dark, image-led login homepage, cookie-based authenticated access to the council experience, a protected council interface for the four named agents, a multi-provider orchestration layer, and database-backed council session persistence.

| Agent | Role | Provider target |
|---|---|---|
| **Metis** | Orchestrator and synthesis lead | Anthropic Claude |
| **Athena** | Strategist | Azure GPT |
| **Argus** | Analyst | Gemini |
| **Loki** | Critic | xAI Grok |

## Required Environment Variables

The application expects the following environment variables.

| Variable | Purpose | Required for |
|---|---|---|
| `JWT_SECRET` | Signs and verifies secure METIS session cookies | Authentication |
| `METIS_DATABASE_URL` | Preferred Neon PostgreSQL connection string override used by the app at runtime | Persistence |
| `DATABASE_URL` | Fallback database URL when the METIS-specific override is not present | Persistence fallback |
| `ANTHROPIC_API_KEY` | Provider key for **Metis** | Orchestration |
| `AZUREGPT54_API_KEY` | Provider key for **Athena** | Orchestration |
| `AZUREGPT54_ENDPOINT` | Azure OpenAI endpoint base URL | Athena routing |
| `AZUREGPT54_DEPLOYMENT` | Azure deployment name for the GPT model | Athena routing |
| `GEMINI_API_KEY` | Provider key for **Argus** | Orchestration |
| `XAI_API_KEY` | Provider key for **Loki** | Orchestration |

> Login credentials are now stored in the `users` table inside Neon. The application verifies the submitted username and password against the stored scrypt password hash instead of reading a login secret from environment variables.

## Local Development

Install dependencies and run the development server with the standard package scripts.

```bash
pnpm install
pnpm dev
```

Run validation before deployment.

```bash
pnpm test
pnpm build
```

## Database and Persistence Model

The current schema is structured around **Neon PostgreSQL** and can still move cleanly to another managed PostgreSQL target later if needed.

| Table | Purpose |
|---|---|
| `users` | Authenticated METIS users |
| `councilSessions` | Long-lived council conversation containers |
| `councilMessages` | User prompts, specialist outputs, and Metis synthesis messages |

This schema keeps the council history explicit and portable while supporting database-backed login and session scoping in the current Neon deployment.

## Vercel Deployment Path

The active application is a **Next.js App Router** project and is ready to deploy on Vercel once the environment variables are set.

| Deployment check | Requirement |
|---|---|
| **Authentication secret** | Set `JWT_SECRET` in Vercel to a strong random string with at least 16 characters before the first deployment. |
| **Database target** | Set `METIS_DATABASE_URL` to the Neon PostgreSQL connection string so the app prefers Neon even if the platform-managed `DATABASE_URL` remains unchanged. |
| **Admin access** | Seed the `users` table with the initial admin username and scrypt password hash before testing login. |
| **Council providers** | Set the four provider keys plus the Azure endpoint and deployment variables. |
| **Validation** | Run `pnpm test` and `pnpm build` before shipping. |

If `JWT_SECRET` is missing, the homepage will stay available but login attempts will return an inline configuration warning instead of crashing the server bundle.

1. Add all required environment variables in the Vercel project settings.
2. Set `METIS_DATABASE_URL` to the Neon PostgreSQL connection string.
3. Confirm the `users`, `councilSessions`, and `councilMessages` tables exist and that the admin user has been seeded.
4. Confirm `pnpm test` and `pnpm build` pass.
5. Deploy the repository to Vercel.
6. Verify homepage authentication, protected `/council` access, and council orchestration behavior.

## Planned AWS Migration Path

The Vercel-first release is intended as the initial delivery layer, not the final long-running orchestration environment.

| Current layer | Later AWS migration target |
|---|---|
| Next.js routes on Vercel | API or job workers on ECS, Lambda, or containerized services |
| Current SQL persistence | AWS RDS |
| In-request orchestration | Queue-backed or workflow-backed long-running council execution |
| Session cookies | Shared auth or federated auth layer as the platform expands |

When METIS begins handling longer tasks, worker coordination, or tool-heavy execution, the council orchestration module can be moved behind a dedicated AWS service while preserving the current web interface.

## Repository Notes

This repository has been rebuilt as a **true Next.js application** to replace the earlier non-Next.js foundation. The remaining codebase is aligned to the requested Vercel-first architecture and is ready for the next step: setting the production secrets and pushing the final state to GitHub.
