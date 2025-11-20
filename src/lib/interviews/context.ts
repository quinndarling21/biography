import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserChapter } from "@/lib/services/biography-data-service";
import type {
  InterviewEntryRecord,
  InterviewMessage,
} from "@/lib/services/interview-service";
import type { Database } from "@/lib/supabase/types";
import { interviewerPromptConfig } from "@/config/prompts/interviewer-agent";

export type InterviewChapterSummary = Pick<
  UserChapter,
  "id" | "title" | "description" | "position"
>;

export type InterviewContext = {
  messages: InterviewMessage[];
  entries: InterviewEntryRecord[];
  chapters: InterviewChapterSummary[];
};

export async function loadInterviewContext(
  client: SupabaseClient<Database>,
  userId: string,
  interviewId: string,
): Promise<InterviewContext> {
  const [messagesResult, entriesResult, chaptersResult] = await Promise.all([
    client
      .from("interview_messages")
      .select("*")
      .eq("interview_id", interviewId)
      .order("sequence", { ascending: true }),
    client
      .from("interview_entries")
      .select("*, chapter_entries(*)")
      .eq("interview_id", interviewId),
    client
      .from("user_chapters")
      .select("id, title, description, position")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const messages = pruneHistory(messagesResult.data ?? []);
  const entries = (entriesResult.data ?? []) as InterviewEntryRecord[];
  const chapters = (chaptersResult.data ?? []) as InterviewChapterSummary[];

  return { messages, entries, chapters };
}

function pruneHistory(messages: InterviewMessage[]): InterviewMessage[] {
  const limit = interviewerPromptConfig.historyLimit;
  if (!limit || messages.length <= limit) {
    return messages;
  }
  return messages.slice(messages.length - limit);
}
