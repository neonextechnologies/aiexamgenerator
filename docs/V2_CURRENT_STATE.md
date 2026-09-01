# V2 Current State — AI Exam Generator

Audited: 2026-08-31  
Repository: `neonextechnologies/aiexamgenerator`

## Stack

- Frontend: React 18 + TypeScript + Vite + Tailwind + Recharts + Lucide
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions)
- AI: OpenAI via Edge Function + client `DemoAIProvider` fallback
- Local: Docker Desktop + `npx supabase start`

## Routes

| Path | Guard | Page |
|------|-------|------|
| `/login`, `/register` | Public | Auth |
| `/dashboard` | Protected | Dashboard |
| `/courses`, `/courses/:id` | Protected | Courses |
| `/generate` | Protected | Generate Wizard (6 steps) |
| `/generation-jobs` | Protected | Jobs |
| `/question-bank`, `/questions/:id` | Protected | Question Bank |
| `/review`, `/review/:id` | Reviewer+ | Human Review |
| `/exams`, `/exams/:id` | Protected | Exams |
| `/reports`, `/usage` | Admin | Reports / Usage |
| `/notifications`, `/settings` | Protected | Notifications / Settings |

## Data layer

- Dual-mode: `isDemoMode` when `VITE_SUPABASE_*` missing → in-memory `demoStore`
- API: `src/lib/api.ts`, documents: `src/lib/documents.ts`, edge: `src/lib/edge.ts`
- Auth: session restore + role routes (post local production hardening)

## Database (13 tables)

`profiles`, `courses`, `learning_outcomes`, `course_topics`, `documents`, `test_blueprints`, `questions`, `exams`, `generation_jobs`, `question_reviews`, `notifications`, `ai_usage_logs`, `audit_logs`

RLS: authenticated-only; role helpers `current_user_role`, `is_staff`, `is_admin`

## Edge Functions

1. `extract-document` — JWT, storage download, text extract
2. `generate-questions` — JWT, OpenAI, insert questions (service role)
3. `seed-demo-users` — service role / SEED_SECRET

## Generation flow today

```
Wizard → documentTexts → generate-questions edge
  → OpenAI OR demoMode 503
  → insertQuestions / savedQuestions
  → generation_jobs + ai_usage_logs + notifications
```

**Gaps:** no Manual mode, no RAG, no Rule/Workflow/Verification engines, no provider abstraction, no chat, no email, AI orchestration lives in React page, `ai_generated` does not auto-enter review queue.

## Components

- `Layout.tsx`, `ui.tsx` only — pages are self-contained

## Technical debt

- Incomplete CRUD (course/exam/blueprint create buttons dead)
- Status handoff `ai_generated` → `ready_for_review` missing
- PDF extraction is regex-based
- No prompt templates / structured Zod validation on client
- Secrets cannot be managed from UI (env/secrets only)
- No automated unit tests for engines

## What to preserve

- Demo mode + dual-path API
- Existing pages and Thai UI
- Current schema tables (extend, do not destroy)
- Existing edge functions (keep; add V2 alongside)
