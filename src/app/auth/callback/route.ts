import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next") ?? "/";
  const redirectPath =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const redirectUrl = new URL(redirectPath, requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set("authError", "Missing verification code.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectUrl.searchParams.set(
      "authError",
      error.message ?? "Unable to verify your session.",
    );
  }

  return NextResponse.redirect(redirectUrl);
}
