# Biography · Life Builder Skeleton

A story-first web application skeleton built with Next.js 16, the App Router, TypeScript, and Tailwind CSS. The UI mirrors the Biography builder concept: a table of contents on the left, and an authoring workspace on the right for milestones, memories, stories, and AI-assisted prompts.

## Requirements

- Node.js ≥ 20.9 (see `.nvmrc`)
- npm (bundled with Node 20+)

Install dependencies:

```bash
npm install
```

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
