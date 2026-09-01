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
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Frontend |
| `OPENAI_API_KEY` | Supabase secrets (optional) |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `COMPAT_API_KEY` | Optional providers |

Never put provider secrets in `VITE_*`.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run setup:local
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
