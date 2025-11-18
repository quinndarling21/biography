"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, Loader2, LogIn, LogOut, UserRound } from "lucide-react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useSupabase } from "@/components/providers/SupabaseProvider";

export function MainNav() {
  const router = useRouter();
  const { user, loading, refreshSession } = useAuth();
  const supabase = useSupabase();
  const [isSigningOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Failed to sign out", error.message);
    }
    await refreshSession();
    router.replace("/login");
    router.refresh();
    setSigningOut(false);
  };

  return (
    <header className="sticky inset-x-0 top-0 z-40 border-b border-[var(--color-border-subtle)] bg-white/80 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-6 px-6 py-4 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 text-[var(--color-text-strong)]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-accent-highlight)]/60 text-[var(--color-text-strong)]">
            <BookMarked className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-semibold">Biography</p>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-text-secondary)]">
              Builder
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 rounded-full border border-[var(--color-border-subtle)] bg-white px-3 py-2 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-highlight)]/70 text-sm font-semibold text-[var(--color-text-strong)]">
                {getInitials(
                  user.user_metadata?.full_name || user.email || "You",
                )}
              </div>
              <div className="hidden text-left text-sm leading-tight text-[var(--color-text-secondary)] sm:block">
                <p className="font-semibold text-[var(--color-text-strong)]">
                  {user.user_metadata?.full_name || "Account"}
                </p>
                <p className="text-xs">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-text-strong)] px-3 py-2 text-xs font-semibold text-on-strong transition hover:bg-[var(--color-text-strong)]/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <LogOut className="h-4 w-4" aria-hidden />
                )}
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-text-strong)]"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-text-strong)] px-4 py-2 text-sm font-semibold text-on-strong transition hover:bg-[var(--color-text-strong)]/90"
              >
                <UserRound className="h-4 w-4" aria-hidden />
                Create account
              </Link>
            </div>
          )}
          {loading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-[var(--color-text-secondary)]"
              aria-label="Checking authentication"
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
