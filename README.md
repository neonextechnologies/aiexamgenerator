# AI Exam Generator

ระบบสร้างและบริหารข้อสอบด้วยปัญญาประดิษฐ์ (AI Exam Generator) สำหรับสถาบันอุดมศึกษาไทย

## Features

- AI-powered question generation from course documents
- Bloom's Taxonomy alignment (Remember → Create)
- Multi-format support (MCQ, True/False, Essay, Case Study)
- Human review workflow with reviewer approval/rejection
- Test blueprint design with CLO mapping
- Exam assembly with multiple versions
- AI usage tracking and cost monitoring
- Comprehensive reporting and analytics
- Role-based access (Instructor, Reviewer, Academic Admin, System Admin)
- Thai and English language support

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **AI**: OpenAI GPT-4o (with demo fallback)
- **Charts**: Recharts
- **Icons**: Lucide React

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Instructor | instructor@example.com | demo1234 |
| Reviewer | reviewer@example.com | demo1234 |
| Academic Admin | academic@example.com | demo1234 |
| System Admin | admin@example.com | demo1234 |

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Project Structure

```
src/
  components/    # Reusable UI components (Layout, Card, Badge, etc.)
  lib/           # Utilities (auth, supabase, AI provider, demo data)
  pages/         # Page components (16 pages)
  types/         # TypeScript type definitions
supabase/
  functions/     # Edge functions (extract-document, generate-questions, seed-demo-users)
  migrations/    # SQL migration files
```

## Database

See [DATABASE_EXPORT.md](./DATABASE_EXPORT.md) for full schema documentation.
13 tables with RLS enabled, 3 edge functions, and storage bucket for course documents.
