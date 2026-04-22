import { redirect } from "next/navigation";

import { InterviewerScreen } from "@/app/interviewer/ui/InterviewerScreen";
import type {
  InterviewDebugLog,
  InterviewEntryRecord,
  InterviewMessage,
  UserInterview,
} from "@/lib/services/interview-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserChapter } from "@/lib/services/biography-data-service";


export default async function InterviewerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to fetch user profile for interviewer page", profileError);
  }

  const isAdmin = Boolean(profileData?.is_admin);

  const { data: interviews, error } = await supabase
    .from("user_interviews")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load interviews", error);
  }

  const normalized: UserInterview[] = interviews ?? [];
  const requestedInterviewId = resolvedSearchParams?.interview as string | undefined;
  const requestedInterview = normalized.find(
    (interview) => interview.id === requestedInterviewId,
  );
  const fallbackInterview = normalized[0];
  const initialInterviewId = requestedInterview?.id ?? fallbackInterview?.id ?? null;

  let initialMessages: InterviewMessage[] = [];
  let initialEntries: InterviewEntryRecord[] = [];

  const { data: chaptersData, error: chaptersError } = await supabase
    .from("user_chapters")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (chaptersError) {
    console.error("Failed to load chapters for interviewer", chaptersError);
  }

  const initialChapters: UserChapter[] = chaptersData ?? [];

  if (initialInterviewId) {
    const [{ data: messages }, { data: entries }] = await Promise.all([
      supabase
        .from("interview_messages")
        .select("*")
        .eq("interview_id", initialInterviewId)
        .order("sequence", { ascending: true }),
      supabase
        .from("interview_entries")
        .select("*, chapter_entries(*)")
        .eq("interview_id", initialInterviewId),
    ]);
    initialMessages = messages ?? [];
    initialEntries = (entries ?? []) as InterviewEntryRecord[];
  }

  let initialDebugLogs: InterviewDebugLog[] = [];
  if (initialInterviewId && isAdmin) {
    const { data: debugRows, error: debugError } = await supabase
      .from("interview_message_debug_logs")
      .select("*")
      .eq("interview_id", initialInterviewId)
      .order("created_at", { ascending: true });

    if (debugError) {
      console.error("Failed to load interview debug logs", debugError);
    } else {
      initialDebugLogs = (debugRows ?? []) as InterviewDebugLog[];
    }
  }

  return (
    <InterviewerScreen
      initialInterviews={normalized}
      initialMessages={initialMessages}
      initialEntries={initialEntries}
      initialInterviewId={initialInterviewId}
      initialChapters={initialChapters}
      isAdmin={isAdmin}
      initialDebugLogs={initialDebugLogs}
    />
  );
}
