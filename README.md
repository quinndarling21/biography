# Biography · Life Builder Skeleton

A story-first web application skeleton built with Next.js 16, the App Router, TypeScript, and Tailwind CSS. The UI mirrors the Biography builder concept: a table of contents on the left, and an authoring workspace on the right for milestones, memories, stories, and AI-assisted prompts.

## Requirements

- Node.js ≥ 20.9 (see `.nvmrc`)
- npm (bundled with Node 20+)

Install dependencies:

```bash
npm install
```

## Interviewer agent architecture

- **Runtime**: Next.js App Router API routes (`src/app/api/interviewer/*`) orchestrate every chat turn. They run on the server so Supabase RLS continues to guard data while the LLM secret key never touches the browser. A server-side agent also means this flow deploys cleanly on Vercel’s Edge/Node runtimes without extra infrastructure.
- **LLM stack**: LangChain’s modular packages (`@langchain/openai` + `@langchain/core`) power a lightweight agent loop. We bind OpenAI’s GPT‑4.1 Mini model (configured as `gpt-4.1-mini`) once per request, add our system prompts, and let it reason through tool calls. LangGraph remains an easy upgrade path if we ever need branching workflows or background jobs.
- **Prompt config**: All interviewer instructions live in `src/config/prompts/interviewer-agent.ts`. This file controls the system persona, response style, max history window, opening question samples, and tool guidance so PMs can tweak tone without touching business logic.
- **Tools**: Two LangChain structured tools encapsulate persistence:
  1. `create_interview_entry` drafts a new `chapter_entries` record and links it through `interview_entries` when the model sees a well-formed story.
  2. `update_interview_entry` amends an existing entry with richer summaries, emotions, or timelines as the participant shares more.
  Both wrap Supabase queries, respect RLS, and capture metadata inside the entry’s JSON `body`.
- **Data dependencies**: For every chat turn we load (a) the last 24 interview messages, (b) any entries already tied to that interview, and (c) the user’s chapters (`src/lib/interviews/context.ts`). These feed into the system prompt so the agent can reference the correct chapters/entry IDs when invoking tools.
- **API surface**:
  - `POST /api/interviewer/interviews` – creates a session row and seeds the first LLM prompt. Returns `{ interview, openingMessage }`.
  - `POST /api/interviewer/messages` – records the user’s message, runs the agent loop, persists the reply, and returns `{ userMessage, interviewerMessage, createdEntryIds, updatedEntryIds }`.
  Front-end code calls these routes via `InterviewService`, while reads (lists, transcripts, entry panels) still use the signed-in Supabase client for low latency.
- **Environment variables**: Provide `OPENAI_API_KEY` alongside the existing Supabase secrets before running `npm run dev`. Without it the interviewer endpoints short‑circuit with a 500 so we never risk leaking prompts.
- **Extensibility**: Because the agent, prompt config, and tools live in dedicated modules (`src/lib/interviews/*`), we can:
  1. Swap models or providers (Anthropic, Azure, etc.) by changing the config + constructor.
  2. Add new tools (e.g., “summarize conversation so far”, “attach media”) without rewiring the UI.
  3. Promote the ad-hoc agent loop to LangGraph for multi-turn planning once we need background summarization or retries.
  4. Persist alternative prompt variants by duplicating the config file and hot-swapping per user, experiment, or AB test.

## Supabase authentication

Authentication is fully wired into the UI (protected homepage, `/login`, nav session UI, magic links, etc.). Supabase manages sessions, refresh tokens, and row-level security (RLS) enforcement—only signed-in users can access the builder.

### 1. Configure secrets

1. Duplicate `.env.example` to `.env.local`.
2. Grab your Supabase project values and update the file:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...` – replaces the legacy anon key per [Supabase discussion #29260](https://github.com/orgs/supabase/discussions/29260)). Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` still works but is now treated as a fallback.
   - `NEXT_PUBLIC_SITE_URL` (the exact origin you’ll serve from, e.g. `http://localhost:3000` or `https://app.example.com`)
   - `SUPABASE_SECRET_KEY` (`sb_secret_...` – replaces `service_role`) and `SUPABASE_JWT_SECRET` stay server-only (CI, background jobs, Next.js server actions); never expose them to the browser.
3. Restart `npm run dev` whenever env vars change.

### 2. Hardening checklist (Supabase Dashboard)

- **API Keys (new model)**: Each project now exposes a publishable key (`sb_publishable_...`) meant for browsers/CLIs and one or more secret keys (`sb_secret_...`) for trusted backends. Rotate/disable the legacy `anon` + `service_role` keys as soon as you complete the migration.
- **Authentication → URL Configuration**: add `<SITE_URL>/auth/callback` to `Redirect URLs`. This route exchanges Supabase codes for sessions and redirects users (optionally preserving `?next=/path`).
- **Authentication → Providers → Email**: keep email-enabled, require confirmations, and configure a custom email domain/Sender Name for higher deliverability.
- **Authentication → Policies**: keep “Allow new users to sign up” enabled only if self-serve access is expected. Otherwise disable and invite users manually from the dashboard.
- **Database → Policies (RLS)**: turn on RLS for every table you create, then add policies that scope rows to `auth.uid()`. The builder already assumes Supabase protects the backing tables.
- **Project Settings → API**: rotate the service role key periodically and store it only in secret managers (Vercel env, Doppler, 1Password, etc.).
- **Project Settings → Auth**: shorten refresh token lifetimes if you require faster revocation, and enable “Enforce email verification” so unverified users cannot log in.

### 3. App flows

- `/` (builder) now renders the interface only when a Supabase session is present; otherwise it shows a secure-landing state with CTA buttons.
- `/login` renders a password + passwordless (magic link) form plus contextual error messaging. Pass `?mode=signup` or `?next=/desired/path` to preselect flows.
- `/auth/callback` is the redirect target for Supabase emails and magic links. It exchanges the `code` query param for a session cookie, then redirects to `/` (or `next`).
- The header shows real-time session status. Signing out revokes the session and refreshes all server components.
- Publishing to production? Ensure no view ever renders `sb_secret` keys—Supabase now blocks these in browsers and only accepts them server-side via the `apikey` header (not `Authorization`).

## Supabase domain data

### Schema overview

The migration in `supabase/migrations/20251117191143_initial_biography_schema.sql` now models the three core layers of the builder:

- `users` – keyed to `auth.users.id`, stores first/last name plus `onboarding_complete`, and controls RLS ownership for all other tables.
- `user_chapters` – the user’s high-level eras (`title`, `description`, `position`) with automatic timestamps and owner-scoped policies. Dates now live exclusively on the entries themselves, while `position` controls manual ordering in the UI.
- `chapter_entries` – granular milestones/memories/stories linked to a chapter. Each entry tracks `entry_type`, `entry_date`, `date_granularity` (`day | month | year`), freeform `summary`, structured `body` JSON, and a lifecycle `status` (`draft | published | archived`).

Every table shares the `handle_updated_at` trigger, RLS is enforced end-to-end, and indexes keep lookups on `user_id` / `chapter_id` fast even as timelines grow.

### Running migrations with Supabase CLI

1. Install and auth the CLI (once per machine):
   ```bash
   brew install supabase/tap/supabase   # or follow https://supabase.com/docs/guides/cli
   supabase login
   ```
2. Link the local repo to your project (the CLI prompts for the project ref like `abcd1234`):
   ```bash
   supabase link --project-ref your-project-ref
   ```
3. Apply the checked-in migrations:
   ```bash
   supabase db push
   ```
   The CLI will run every file in `supabase/migrations` in chronological order and verify RLS/policy state. For a clean development database you can reset everything with `supabase db reset`.

Commit future schema changes as new timestamped SQL files in `supabase/migrations/` to keep the project deploy-ready.

### Type-safe data access layer

- `src/lib/supabase/types.ts` mirrors the schema in TypeScript so `SupabaseClient<Database>` is strongly typed across the app (server + browser).
- `src/lib/services/biography-data-service.ts` wraps the Supabase client with a single, reusable API (`listStories`, `createEntry`, `ensureProfile`, etc.). Each method returns a consistent `{ data, error }` shape and accepts structured filters (e.g., `listEntries(storyId, { sectionId, entryType })`).
- Instantiate the service anywhere you already have a Supabase client:

  ```ts
  import { BiographyDataService } from "@/lib/services/biography-data-service";
  import { createSupabaseServerClient } from "@/lib/supabase/server";

  const supabase = await createSupabaseServerClient();
  const dataService = new BiographyDataService(supabase);
  const {
    data: stories,
    error,
  } = await dataService.listStories(user.id);
  ```

  The shared service keeps querying logic, error handling, and table names centralized so new tables or policies only need to be encoded once.

### Keeping migrations and types in sync

1. **One-time setup**
   - Install the Supabase CLI (`brew install supabase/tap/supabase`).
   - `supabase login` to store your access token locally.
   - `supabase link --project-ref <your-ref>` so the CLI knows which hosted project to target. (For purely local development start Docker Desktop and run `supabase start` instead, then export `SUPABASE_DB_TARGET=local` before the commands below.)
2. **Daily workflow**
   - Run `npm run db:sync` after editing any SQL migration. This single command:
     1. Executes `supabase db push` against your linked (or local) project to apply migrations.
     2. Calls `supabase gen types typescript` and rewrites `src/lib/supabase/types.ts` so the app always matches the latest schema.
   - Need to run only one half of the workflow? Use `npm run db:push` (migrations only) or `npm run db:types` (generate types only).

You can customise how the sync runs through environment variables:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `SUPABASE_DB_TARGET` | `linked` | Set to `local` to hit the local Docker stack (`supabase start` required) or `db-url` to point at a custom Postgres URL (requires `SUPABASE_DB_URL`). |
| `SUPABASE_DB_SCHEMAS` | `public` | Comma-separated schemas to include when generating types. |
| `SUPABASE_TYPES_PATH` | `src/lib/supabase/types.ts` | Destination file for the generated `Database` typings. |

Because `scripts/db-sync.mjs` wraps both commands, keeping schema <-> type parity becomes part of the normal workflow rather than a manual checklist.

## Available scripts

- `npm run dev` – start the local dev server (Turbopack).
- `npm run build` – production build.
- `npm run start` – run the compiled build.
- `npm run lint` – ESLint across the repo.
- `npm run lint:fix` – ESLint with `--fix`.
- `npm run typecheck` – TypeScript in `--noEmit` mode.
- `npm run check` – lint + typecheck (good for CI).

## Project structure

```
src/
  app/
    layout.tsx        # Global metadata + shell
    page.tsx          # Main builder layout (TOC + workspace)
    globals.css       # Tailwind + design tokens
  components/
    builder/          # TableOfContents, BuilderAction cards, workspace widgets
    common/           # PageContainer and shared primitives
    layout/           # SiteShell wrapper
    navigation/       # Header + footer
    ui/               # Reusable Button primitive
  data/
    builder-actions.ts
    chapters.ts
  lib/                # Site config + helper utilities
public/               # Static assets
```

## Design reference

### Design principles

1. **Narrative-first** – prioritize clarity about chapters, stories, and memories over chrome or animation.
2. **Flat, calm surfaces** – the palette is used in solid blocks; gradients are avoided except in subtle shadows.
3. **Readable scaffolding** – cards, lists, and inputs should be obvious regarding hierarchy and state.
4. **Assistive cues** – microcopy (kickers, summaries) should guide what each pane does without instructions elsewhere.

### UI principles

- **Two-column layout**: left column for structure (table of contents), right column for creation.
- **Rounded geometry**: large 20–32px radii to keep the app approachable.
- **Consistent spacing**: 24px outer gutters, 16px inner spacing on list items, 32px vertical rhythm for sections.
- **Iconography**: Lucide icons wrapped in 40–48px rounded squares to reinforce affordances.

### Color palette

| Token | Hex | Usage |
| ----- | --- | ----- |
| `--color-ink` | `#331832` | Primary text, emphasis |
| `--color-plum` | `#694D75` | Secondary text, labels |
| `--color-slate` | `#76949F` | Body copy, dividers |
| `--color-tide` | `#86BBBD` | Action accents, success cues |
| `--color-peach` | `#FFC9B5` | Highlights, selection states |
| `--color-sand` | `#F7F1EB` | App background |
| `--color-slate-100` | `#DBE5EA` | Soft borders, separators |

### Typography

- **Font family**: Geist (provided by `next/font`), falling back to system sans-serifs.
- **Display**: 24–32px for section headings, tracking tightened to keep text grounded.
- **Labels**: Uppercase, 0.3–0.4em tracking, using `--color-plum` for subtle contrast.
- **Body**: 14–16px with `--color-slate` for supportive text.

### Layout patterns

- **Table of contents panel**: `section > header + chapter cards`. Cards expand vertically with nested timelines (`border-l` list) for entries.
- **Builder workspace**: Stack of action cards followed by two sub-panels (manual builder + AI prompting). Each card is a flat surface with border + soft shadow.
- **Navigation**: Compact header with book icon, uppercase label, and icon buttons for account/settings. Footer pulls social links from `siteConfig`.

## Suggested next steps

1. Replace the placeholder chapters/actions in `src/data/chapters.ts` and `src/data/builder-actions.ts` with real data or API hooks.
2. Connect state management (React Server Actions, Zustand, etc.) once interactive authoring starts.
3. Add analytics/instrumentation (Vercel Analytics, PostHog, etc.) before launch.
4. Configure CI (GitHub Actions or similar) to run `npm run check` and `npm run build`.
5. When ready to deploy, connect the repo to Vercel—no extra config required.

---

Questions or ideas? Keep iterating locally—the skeleton is intentionally light so it can scale with the product.
