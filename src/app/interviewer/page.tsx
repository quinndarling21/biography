import { redirect } from "next/navigation";

import { InterviewerScreen } from "@/app/interviewer/ui/InterviewerScreen";
import type {
  InterviewEntryRecord,
  InterviewMessage,
  UserInterview,
} from "@/lib/services/interview-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserChapter } from "@/lib/services/biography-data-service";

type InterviewerPageProps = {
  searchParams?: {
    interview?: string;
  };
};

export default async function InterviewerPage({
  searchParams,
}: InterviewerPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: interviews, error } = await supabase
    .from("user_interviews")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load interviews", error);
  }

  const normalized: UserInterview[] = interviews ?? [];
  const requestedInterviewId = searchParams?.interview;
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
    .order("start_date", { ascending: true, nullsFirst: true })
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

  return (
    <InterviewerScreen
      userId={user.id}
      initialInterviews={normalized}
      initialMessages={initialMessages}
      initialEntries={initialEntries}
      initialInterviewId={initialInterviewId}
      initialChapters={initialChapters}
    />
  );
}
