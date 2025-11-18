"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, Send, Sparkles, UserPlus } from "lucide-react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { getSiteUrl } from "@/lib/supabase/config";
import { cn, safeRoute } from "@/lib/utils";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  initialMode?: AuthMode;
  nextPath?: string;
};

export function AuthForm({
  initialMode = "login",
  nextPath,
}: AuthFormProps) {
  const router = useRouter();
  const supabase = useSupabase();
  const { refreshSession } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);

  const redirectSuffix = nextPath
    ? `?next=${encodeURIComponent(nextPath)}`
    : "";
  const authRedirectTo = `${getSiteUrl()}/auth/callback${redirectSuffix}`;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError(null);
    setFormSuccess(null);
    setPassword("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!email) {
      setFormError("Please enter an email address.");
      return;
    }

    if (!password) {
      setFormError("Please enter your password.");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setFormError("Passwords must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        await refreshSession();
        router.replace(safeRoute(nextPath));
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectTo,
          },
        });

        if (error) {
          throw error;
        }

        setFormSuccess(
          "Check your inbox to verify your email and finish creating your account.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to process request.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    setFormError(null);
    setFormSuccess(null);

    if (!email) {
      setFormError("Enter your email before requesting a magic link.");
      return;
    }

    setIsSendingLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: authRedirectTo,
        },
      });
      if (error) {
        throw error;
      }
      setFormSuccess("Check your email for a secure magic sign-in link.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send the magic link.";
      setFormError(message);
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <div className="space-y-6 rounded-3xl border border-[var(--color-border-subtle)] bg-white/90 p-8 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--color-accent-highlight)]/40 p-3 text-sm font-medium text-[var(--color-text-strong)]">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition",
            mode === "login"
              ? "bg-white shadow"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          <Lock className="h-4 w-4" aria-hidden />
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition",
            mode === "signup"
              ? "bg-white shadow"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Create account
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Email
          <div className="mt-1 flex items-center gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-white/80 px-4 py-3 focus-within:border-[var(--color-text-strong)]">
            <Mail className="h-4 w-4 text-[var(--color-text-secondary)]" />
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-transparent text-[var(--color-text-strong)] outline-none placeholder:text-[var(--color-text-secondary)]"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
        </label>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Password
          <div className="mt-1 flex items-center gap-2 rounded-2xl border border-[var(--color-border-subtle)] bg-white/80 px-4 py-3 focus-within:border-[var(--color-text-strong)]">
            <Sparkles className="h-4 w-4 text-[var(--color-text-secondary)]" />
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-transparent text-[var(--color-text-strong)] outline-none placeholder:text-[var(--color-text-secondary)]"
              placeholder="Minimum 8 characters"
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-text-strong)] px-6 py-3 text-base font-semibold text-on-strong transition hover:bg-[var(--color-text-strong)]/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Processing…
            </>
          ) : mode === "login" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </button>
        <button
          type="button"
          onClick={handleMagicLink}
          disabled={isSendingLink}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--color-border-subtle)] px-6 py-3 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-text-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSendingLink ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending secure link…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Email me a magic sign-in link
            </>
          )}
        </button>
      </form>
      <div className="min-h-[28px] text-sm">
        {formError ? (
          <p className="rounded-2xl bg-red-50 px-4 py-2 text-red-900">{formError}</p>
        ) : null}
        {formSuccess ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-emerald-900">
            {formSuccess}
          </p>
        ) : null}
        {!formError && !formSuccess ? (
          <p className="text-[var(--color-text-secondary)]">
            {mode === "signup"
              ? "You’ll receive an email to confirm your address before your account becomes active."
              : "Forgot your password? Send yourself a magic link above."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
