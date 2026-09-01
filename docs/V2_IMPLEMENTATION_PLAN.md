# V2 Implementation Plan

## Status (2026-08-31 overnight)

### Phase 1 — Foundation ✅
- [x] Docs: CURRENT_STATE, ARCHITECTURE, PLAN
- [x] Service interfaces under `src/services/*`
- [x] Types in `src/types/v2.ts`
- [x] Orchestrator facade → exam-engine / local pipeline
- [x] Legacy generate path preserved (`LegacyGenerateWizardPage`)

### Phase 2 — AI Providers ✅
- [x] Tables `ai_providers`, `prompt_templates`
- [x] Adapters metadata: demo, openai, gemini, anthropic, openai_compatible
- [x] Settings Providers tab + test connection
- [x] Model routing fields on provider rows

### Phase 3 — Knowledge Engine ✅
- [x] `document_chunks` + pgvector extension
- [x] Ingest after document extract
- [x] Lexical retrieve + Evidence Pack
- [x] Knowledge-bounded flag in wizard/orchestrator

### Phase 4 — Rule Engine ✅
- [x] rules / rule_sets / executions / violations tables
- [x] Seed SYSTEM/MANDATORY rules
- [x] Evaluator + `/rules` UI

### Phase 5 — Workflow Engine ✅
- [x] workflow tables + default exam workflow seed
- [x] Executor hooks in orchestrator
- [x] `/workflows` UI

### Phase 6 — Analysis & Decision ✅
- [x] Evidence coverage analysis
- [x] INSUFFICIENT_EVIDENCE handling

### Phase 7 — Generation V2 ✅
- [x] `exam-engine` edge function
- [x] Structured generation path + local controlled pipeline
- [x] Traceability via `generation_executions`
- [x] Status → `ready_for_review` when verified

### Phase 8 — Verification ✅
- [x] Deterministic checks + quality dimensions
- [x] Correction loop (bounded)

### Phase 9 — Manual / Hybrid UX ✅
- [x] `/questions/new` Manual Builder
- [x] Wizard modes Manual | Hybrid | AI (`GenerateWizardV2`)
- [x] AI assist buttons in manual editor

### Phase 10 — Chat Assistant ✅
- [x] chat tables
- [x] Assistant panel + FAB
- [x] Propose → Confirm actions

### Phase 11 — Email & Alerts ✅
- [x] Email provider abstraction + templates
- [x] Notification service (in-app + optional email prefs)

### Phase 12 — Security ✅
- [x] RLS for new tables
- [x] No client-side provider secrets (secret_ref only)

### Phase 13 — Tests & Docs ✅
- [x] Unit tests: rules, verification, analysis
- [x] README V2
- [x] Architecture docs

## Follow-ups (non-blocking)

- Real Gemini/Anthropic HTTP adapters beyond secret presence checks
- True embedding vectors when OPENAI/GEMINI embedding keys set
- Visual drag-drop workflow designer
- Full email SMTP/Resend send path
- Experiment comparison UI for research runs
