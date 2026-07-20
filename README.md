# AI Exam Generator

AI-powered exam question generation system for educational institutions. Generate high-quality exam questions from course documents using OpenAI, with support for Bloom's taxonomy, difficulty levels, and a full review workflow.

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI:** OpenAI API
- **Icons:** Lucide React

## Features

- Generate exam questions from uploaded course documents
- Bloom's taxonomy level selection (Remember, Understand, Apply, Analyze, Evaluate, Create)
- Difficulty level control (Easy, Medium, Hard, Advanced)
- Multiple question types (Multiple choice, True/False, Essay, Case study, etc.)
- Question review workflow with reviewer approval/rejection
- Test blueprint creation with topic-CLO-Bloom mapping
- Exam assembly with multiple versions and shuffling
- AI usage analytics and cost tracking
- Notification system
- Role-based access (Instructor, Reviewer, Academic Admin, System Admin)
- Bilingual support (Thai/English)

## Setup

```bash
npm install
npm run dev
```

## Database

The file `db_export.sql` contains the complete database schema (tables, indexes, RLS policies) and seed data. Run it against your Supabase project to set up the database.

### Seed Users

- instructor@example.com (Instructor)
- reviewer@example.com (Reviewer)
- academic@example.com (Academic Admin)
- admin@example.com (System Admin)

## Project Structure

```
src/
  components/    # Shared UI components
  lib/           # Utilities, auth, Supabase client, AI provider
  pages/         # Route-level page components
  types/         # TypeScript type definitions
supabase/
  functions/     # Edge functions (extract-document, generate-questions, seed-demo-users)
  migrations/    # SQL migrations
db_export.sql   # Full database export
```

## Scripts

- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking
