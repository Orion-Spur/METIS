# METIS

**METIS** is a secure, cinematic **Next.js** web application for running a four-agent AI council session. The first release is designed for **Vercel deployment**, while the persistence and orchestration structure are intentionally prepared for a later migration to **AWS-backed long-running workloads**.

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
| `METIS_LOGIN_USERNAME` | Username accepted by the login form | Login |
| `METIS_LOGIN_PASSWORD` or `METIS_LOGIN_PASSWORD_HASH` | Plaintext password for quick setup, or preferred scrypt hash for production | Login |
| `ANTHROPIC_API_KEY` | Provider key for **Metis** | Orchestration |
| `AZUREGPT54_API_KEY` | Provider key for **Athena** | Orchestration |
| `AZUREGPT54_ENDPOINT` | Azure OpenAI endpoint base URL | Athena routing |
| `AZUREGPT54_DEPLOYMENT` | Azure deployment name for the GPT model | Athena routing |
| `GEMINI_API_KEY` | Provider key for **Argus** | Orchestration |
| `XAI_API_KEY` | Provider key for **Loki** | Orchestration |
| `DATABASE_URL` | MySQL-compatible database connection string | Persistence |

> For production, prefer `METIS_LOGIN_PASSWORD_HASH` over `METIS_LOGIN_PASSWORD` so the repository never depends on a plaintext login secret.

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

The current schema is structured so it can move cleanly from the current hosted database to **AWS RDS** later.

| Table | Purpose |
|---|---|
| `users` | Authenticated METIS users |
| `councilSessions` | Long-lived council conversation containers |
| `councilMessages` | User prompts, specialist outputs, and Metis synthesis messages |

This schema keeps the council history explicit and portable, which makes future migration to **AWS RDS** straightforward.

## Vercel Deployment Path

The active application is a **Next.js App Router** project and is ready to deploy on Vercel once the environment variables are set.

1. Add all required environment variables in the deployment environment.
2. Confirm `pnpm test` and `pnpm build` pass.
3. Deploy the repository to Vercel.
4. Verify homepage authentication, protected `/council` access, and council orchestration behavior.

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
