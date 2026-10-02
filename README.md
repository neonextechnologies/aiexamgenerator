# AI Exam Generator V2 — Controlled Hybrid Platform

ระบบสร้างและบริหารข้อสอบแบบ Controlled Hybrid สำหรับสถาบันอุดมศึกษาไทย

AI **ไม่บังคับ** — รองรับ Manual / Hybrid / AI

## Quick start

```bash
npm install
npm run setup:local   # Docker Desktop + Supabase + .env
npm run dev
```

Demo (no backend): omit `.env` → in-memory Demo Mode.

## Modes

| Mode | Path | AI |
|------|------|----|
| Manual | `/questions/new` | ไม่เรียก |
| Hybrid / AI | `/generate` | Orchestrator + Rules + Evidence + Verify |

## Architecture docs

- [docs/V2_CURRENT_STATE.md](./docs/V2_CURRENT_STATE.md)
- [docs/V2_ARCHITECTURE.md](./docs/V2_ARCHITECTURE.md)
- [docs/V2_IMPLEMENTATION_PLAN.md](./docs/V2_IMPLEMENTATION_PLAN.md)

## Stack

- React + TypeScript + Vite + Tailwind
- Supabase (Postgres + Auth + Storage + Edge Functions + pgvector)
- Providers: Demo, OpenAI, Gemini, Anthropic, OpenAI-Compatible
- Engines: Knowledge, Rules, Workflow, Analysis, Verification, Orchestrator, Chat

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Instructor | instructor@example.com | demo1234 |
| Reviewer | reviewer@example.com | demo1234 |
| Academic Admin | academic@example.com | demo1234 |
| System Admin | admin@example.com | demo1234 |

## Env

See `.env.example`.

| Variable | Where |
|----------|--------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Frontend. Omit both for Demo Mode |
| `OPENAI_API_KEY` | Supabase secret. Used when OpenAI is enabled, or when no other provider is enabled |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `COMPAT_API_KEY` | Supabase secrets for the matching Settings provider |
| `RESEND_API_KEY` + `EMAIL_FROM` | Supabase secrets. Real email via Resend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` | Supabase secrets. Real email via SMTP |

Question generation uses the enabled provider in Settings. Email uses Resend or SMTP when those secrets are set, and the demo logger otherwise. On hosted Supabase, prefer Resend: SMTP needs a raw TCP connection from the edge runtime. Never put provider or email secrets in `VITE_*`. See `.env.example`.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run setup:local
npm run lint
```

## Key routes

- `/generate` — Controlled wizard (Manual/Hybrid/AI)
- `/questions/new` — Manual builder
- `/rules`, `/workflows` — Admin control plane
- `/settings` — Providers / Knowledge / Email
- Assistant FAB on app pages

## Principle

```
Teacher → Knowledge → CLO → Blueprint → Workflow → Rules
→ Evidence → Analysis → AI Generation → Verification
→ Human Review → Question Bank → Exam
```
