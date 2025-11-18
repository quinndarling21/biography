import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore
          .getAll()
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        const set = cookieStore.set?.bind(cookieStore);
        if (typeof set !== "function") {
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            set({ name, value, ...options });
          } catch {
            // `set` is only supported in route handlers and middleware.
          }
        });
      },
    },
  });
}
