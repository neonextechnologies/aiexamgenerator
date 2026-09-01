# V2 Architecture — Controlled Hybrid AI Examination Platform

## Principle

```
Teacher → Knowledge → LO/CLO → Blueprint → Workflow → Rules
        → Evidence → Analysis → AI Generation → Verification
        → Human Review → Question Bank → Exam
```

AI is never mandatory. Manual Mode is first-class.

## Operating modes

| Mode | AI calls | Description |
|------|----------|-------------|
| Manual | None | Instructor writes questions fully |
| Hybrid | Optional assist | Instructor configures; AI drafts selected tasks |
| AI | Full pipeline | Controlled generation through engines |

## Module map

```
src/services/
  ai/           Provider adapters + orchestrator client
  knowledge/    KnowledgeProvider (ingest/retrieve/evidence)
  rules/        Rule evaluator
  workflows/    Workflow executor
  verification/ Deterministic + semantic checks
  chat/         Context-aware assistant
  email/        Email provider abstraction
  notifications/ Multi-channel alerts
  orchestrator/ Generation pipeline facade
```

## Server-side

Edge Function `exam-engine` handles sensitive work:

- `analyze` — Analysis & Decision Engine
- `retrieve` — Knowledge retrieval + Evidence Pack
- `generate` — Structured question generation
- `verify` — Verification
- `correct` — Bounded self-correction
- `chat` — Assistant reply
- `ingest` — Chunk + embed document
- `provider_test` — Test connection (server holds secrets)

Legacy functions remain: `extract-document`, `generate-questions`, `seed-demo-users`.

## Provider architecture

```ts
interface AIProvider {
  id: string
  generate(req): Promise<StructuredResult>
  chat(req): Promise<ChatResult>
  analyze(req): Promise<AnalysisResult>
  verify(req): Promise<VerifyResult>
  embed?(texts): Promise<number[][]>
  healthCheck(): Promise<boolean>
}
```

Adapters: `demo`, `openai`, `gemini`, `anthropic`, `openai_compatible`

Browser never receives decrypted API keys. Config rows in DB store metadata; secrets via Supabase secrets / encrypted columns accessed only by Edge.

## Knowledge architecture

```
Upload → Extract → Normalize → Chunk → Embed → Index → Retrieve → Evidence Pack
```

`document_chunks` + optional pgvector. Initial retrieval: embedding cosine when available, else lexical fallback. Pluggable `KnowledgeProvider`.

## Rule Engine

Scopes (priority high→low): SYSTEM > MANDATORY > ORGANIZATION > COURSE > WORKFLOW > GENERATION > USER

Blocking vs warning. Evaluated before/after generation and during verification.

## Workflow Engine

Default steps:

```
DEFINE → KNOWLEDGE_PREPARE → PLAN → RETRIEVE → ANALYZE
→ GENERATE → VERIFY → HUMAN_REVIEW → APPROVE → DELIVER
```

Manual mode short-circuits to DEFINE → HUMAN_REVIEW (optional) → APPROVE.

## Verification

Deterministic first (fields, MCQ counts, CLO, source, duplicates, blueprint).  
Semantic second (Bloom/difficulty/grounding) via AI when configured.

## Data flow (Hybrid/AI)

```
GenerateWizard / ManualBuilder
        ↓
orchestrator.runGeneration(request)
        ↓
exam-engine (server)
        ↓
workflow executor → rules → knowledge → analysis
        ↓
AI provider → structured questions
        ↓
verification → correct(≤N) → persist + trace
        ↓
UI shows results → Human Review
```

## New UI surfaces

| Route | Purpose |
|-------|---------|
| `/questions/new` | Manual Question Builder |
| `/rules`, `/rule-sets` | Rule management |
| `/workflows` | Workflow management |
| `/settings` (tabs) | Providers, Knowledge, Email, Security |
| Assistant panel | Context chat on key pages |

## Security

- No client-side provider secrets
- Edge JWT required for mutating AI ops
- RLS continues; extend for new tables
- Audit + execution records for every AI run
