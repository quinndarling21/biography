# Biography · Life Builder Skeleton

A story-first web application skeleton built with Next.js 16, the App Router, TypeScript, and Tailwind CSS. The UI mirrors the Biography builder concept: a table of contents on the left, and an authoring workspace on the right for milestones, memories, stories, and AI-assisted prompts.

## Requirements

- Node.js ≥ 20.9 (see `.nvmrc`)
- npm (bundled with Node 20+)

Install dependencies:

```bash
npm install
```

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
