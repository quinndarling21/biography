"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import { useSupabase } from "@/components/providers/SupabaseProvider";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
  initialUser: User | null;
};

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const supabase = useSupabase();
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    const {
      data: { user: nextUser },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      console.error("Failed to fetch Supabase user", error.message);
    }
    setUser(nextUser ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      setLoading(true);
      const {
        data: { user: nextUser },
        error,
      } = await supabase.auth.getUser();
      if (!isMounted) {
        return;
      }
      if (error) {
        console.error("Failed to fetch Supabase user", error.message);
      }
      setUser(nextUser ?? null);
      setLoading(false);
    };

    if (!initialUser) {
      void hydrate();
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (!isMounted) {
        return;
      }
      void hydrate();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialUser, supabase]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshSession,
    }),
    [user, loading, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider />");
  }

  return context;
}
