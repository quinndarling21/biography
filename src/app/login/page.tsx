import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";

import { AuthForm } from "@/components/auth/AuthForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in – Biography",
  description: "Securely sign in or create a Biography account through Supabase Auth.",
};

type LoginPageSearchParams = {
  mode?: string;
  authError?: string;
  next?: string;
};

type LoginPageProps = {
  searchParams: Promise<LoginPageSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const errorFromRedirect = resolvedSearchParams?.authError;
  const initialMode: "login" | "signup" =
    resolvedSearchParams?.mode === "signup" ? "signup" : "login";
  const requestedNext = resolvedSearchParams?.next ?? undefined;
  const nextPath =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : undefined;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12 lg:py-20">
      <header className="space-y-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          <Shield className="h-4 w-4" aria-hidden />
          Secure area
        </p>
        <h1 className="text-3xl font-semibold text-[var(--color-text-strong)]">
          Let&rsquo;s get you logged in
        </h1>
      </header>
      {errorFromRedirect ? (
        <p className="rounded-3xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-900">
          {errorFromRedirect}
        </p>
      ) : null}
      <AuthForm initialMode={initialMode} nextPath={nextPath} />
    </div>
  );
}
