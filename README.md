# Biography

Biography is a story-first web app for capturing a personal history as a structured, editable life narrative. Users can organize their life into chapters, add entries manually, or use AI-guided interviews to turn spoken or written memories into timeline-ready drafts.

## Product Features

- Organize a life story into chapters and timeline entries
- Add milestones, memories, and long-form stories manually
- Run guided chat interviews that ask follow-up questions and capture structured details
- Run voice interviews with live transcript and session activity
- Turn interview responses into draft biography entries linked to the right chapter
- Resume past interviews and continue building the story over time
- Review and edit captured entries before keeping them in the timeline
- Protect user data with Supabase Auth and row-level security

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase for Auth, Postgres, and row-level security
- OpenAI + LangChain for the interviewer flows
- Zod for request validation

## Getting Started

### Prerequisites

- Node.js 20.9+
- npm
- A Supabase project
- An OpenAI API key for chat and voice interviewing

### Install dependencies

```bash
npm install
```

### Configure environment variables

Copy `.env.example` to `.env.local` and set the following values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SECRET_KEY` for server-side elevated Supabase access when needed
- `SUPABASE_JWT_SECRET` if your Supabase setup requires it
- `OPENAI_API_KEY` for the AI interviewer features

Without `OPENAI_API_KEY`, the manual builder can still load, but the interview routes will not work.

### Apply the database schema

Install the Supabase CLI, link your project, then push the checked-in migrations:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

### Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` starts the local development server
- `npm run build` builds the production app
- `npm run start` runs the production build locally
- `npm run lint` runs ESLint
- `npm run lint:fix` runs ESLint with auto-fixes
- `npm run typecheck` runs TypeScript in `--noEmit` mode
- `npm run check` runs linting and typechecking
- `npm run db:sync` applies migrations and regenerates Supabase types
- `npm run db:push` applies migrations only
- `npm run db:types` regenerates Supabase types only

## Project Structure

```text
src/app/                    Next.js pages and API routes
src/components/             UI and builder/interviewer components
src/lib/services/           Supabase-backed service layer
src/lib/interviews/         Interview agent, prompt, and tool logic
supabase/migrations/        Database schema and evolution
```

## Notes

- Chat and voice interviews require a signed-in user
- Voice interviews require browser microphone access
- Supabase row-level security keeps biography data scoped per user
