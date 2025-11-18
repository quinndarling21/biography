"use client";

import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { SupabaseProvider } from "@/components/providers/SupabaseProvider";

type ProvidersProps = {
  children: ReactNode;
  initialUser: User | null;
};

export function Providers({ children, initialUser }: ProvidersProps) {
  return (
    <SupabaseProvider>
      <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
    </SupabaseProvider>
  );
}
