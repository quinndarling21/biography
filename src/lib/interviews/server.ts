import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserInterview } from "@/lib/services/interview-service";

export async function createInterviewRouteContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    user,
  };
}

export async function loadOwnedInterview(
  supabase: SupabaseClient<Database>,
  userId: string,
  interviewId: string,
): Promise<{ data: UserInterview | null; error: string | null; status: number }> {
  const interviewResult = await supabase
    .from("user_interviews")
    .select("*")
    .eq("id", interviewId)
    .eq("user_id", userId)
    .maybeSingle();

  if (interviewResult.error) {
    console.error("Failed to load interview", interviewResult.error);
    return {
      data: null,
      error: "Unable to load this interview.",
      status: 500,
    };
  }

  if (!interviewResult.data) {
    return {
      data: null,
      error: "Interview not found.",
      status: 404,
    };
  }

  return {
    data: interviewResult.data,
    error: null,
    status: 200,
  };
}
