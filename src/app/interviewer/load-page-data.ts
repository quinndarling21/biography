import type {
  InterviewDebugLog,
  InterviewEntryRecord,
  InterviewMessage,
  InterviewMode,
  InterviewRealtimeEvent,
  UserInterview,
} from "@/lib/services/interview-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserChapter } from "@/lib/services/biography-data-service";
import { sortInterviewMessages as sortMessages } from "@/lib/services/interview-service";

export async function loadInterviewerPageData(options: {
  mode: InterviewMode;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      isAdmin: false,
      interviews: [] as UserInterview[],
      initialMessages: [] as InterviewMessage[],
      initialEntries: [] as InterviewEntryRecord[],
      initialDebugLogs: [] as InterviewDebugLog[],
      initialRealtimeEvents: [] as InterviewRealtimeEvent[],
      initialInterviewId: null as string | null,
      initialChapters: [] as UserChapter[],
    };
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
    .eq("mode", options.mode)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load interviews", error);
  }

  const normalized: UserInterview[] = interviews ?? [];
  const requestedInterviewId = options.searchParams?.interview as string | undefined;
  const requestedInterview = normalized.find(
    (interview) => interview.id === requestedInterviewId,
  );
  const fallbackInterview = normalized[0];
  const initialInterviewId = requestedInterview?.id ?? fallbackInterview?.id ?? null;

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

  let initialMessages: InterviewMessage[] = [];
  let initialEntries: InterviewEntryRecord[] = [];

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
    initialMessages = sortMessages(messages ?? []);
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

  let initialRealtimeEvents: InterviewRealtimeEvent[] = [];
  if (initialInterviewId && options.mode === "voice") {
    const { data: eventRows, error: eventError } = await supabase
      .from("interview_realtime_events")
      .select("*")
      .eq("interview_id", initialInterviewId)
      .order("sequence", { ascending: true })
      .limit(80);

    if (eventError) {
      console.error("Failed to load realtime interview events", eventError);
    } else {
      initialRealtimeEvents = (eventRows ?? []) as InterviewRealtimeEvent[];
    }
  }

  return {
    user,
    isAdmin,
    interviews: normalized,
    initialMessages,
    initialEntries,
    initialDebugLogs,
    initialRealtimeEvents,
    initialInterviewId,
    initialChapters,
  };
}
