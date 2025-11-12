import type { ReactNode } from "react";
import Link from "next/link";
import { BookMarked, Settings2, UserRound } from "lucide-react";

import { siteConfig } from "@/lib/site-config";

export function MainNav() {
  return (
    <header className="sticky inset-x-0 top-0 z-40 border-b border-[color:var(--color-border-subtle)] bg-white/80 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-6 px-6 py-4 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 text-[color:var(--color-text-strong)]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--color-accent-highlight)]/60 text-[color:var(--color-text-strong)]">
            <BookMarked className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-semibold">Biography</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <IconButton label="Account">
            <UserRound className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Preferences">
            <Settings2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--color-border-subtle)] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-accent-highlight)]/50"
    >
      {children}
    </button>
  );
}
