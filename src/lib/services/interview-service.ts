import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { ServiceError, ServiceResult } from "@/lib/services/biography-data-service";
import type { Database } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];

export type UserInterview = Tables["user_interviews"]["Row"];
export type InterviewMessage = Tables["interview_messages"]["Row"];
type InterviewEntryLink = Tables["interview_entries"]["Row"];
type ChapterEntryRow = Tables["chapter_entries"]["Row"];

export type InterviewEntryRecord = InterviewEntryLink & {
  chapter_entries: ChapterEntryRow | null;
};

type SendMessageResult = {
  userMessage: InterviewMessage;
  interviewerMessage: InterviewMessage;
  createdEntryId: string | null;
};

export class InterviewService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listInterviews(userId: string): Promise<ServiceResult<UserInterview[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("user_interviews")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      `list interviews for ${userId}`,
    );
  }

  async getMessages(interviewId: string): Promise<ServiceResult<InterviewMessage[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("interview_messages")
          .select("*")
          .eq("interview_id", interviewId)
          .order("sequence", { ascending: true }),
      `load interview messages ${interviewId}`,
    );
  }

  async getEntries(interviewId: string): Promise<ServiceResult<InterviewEntryRecord[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("interview_entries")
          .select("*, chapter_entries(*)")
          .eq("interview_id", interviewId),
      `load interview entries ${interviewId}`,
    );
  }

  async createInterview(userId: string): Promise<ServiceResult<UserInterview>> {
    const interviewResult = await this.resolveRequired(
      () =>
        this.client
          .from("user_interviews")
          .insert({
            user_id: userId,
            name: this.generateInterviewName(),
          })
          .select("*")
          .single(),
      "create interview",
    );

    if (!interviewResult.error) {
      await this.client.from("interview_messages").insert({
        interview_id: interviewResult.data.id,
        author: "chat_interviewer",
        body: "Welcome! I’ll guide you with a few prompts to capture new memories.",
      });
    }

    return interviewResult;
  }

  async reopenInterview(interviewId: string): Promise<ServiceResult<UserInterview>> {
    return this.resolveRequired(
      () =>
        this.client
          .from("user_interviews")
          .update({ status: "in_progress" })
          .eq("id", interviewId)
          .select("*")
          .single(),
      `reopen interview ${interviewId}`,
    );
  }

  async closeInterview(interviewId: string): Promise<ServiceResult<UserInterview>> {
    return this.resolveRequired(
      () =>
        this.client
          .from("user_interviews")
          .update({ status: "closed" })
          .eq("id", interviewId)
          .select("*")
          .single(),
      `close interview ${interviewId}`,
    );
  }

  async sendUserMessage({
    userId,
    interviewId,
    body,
  }: {
    userId: string;
    interviewId: string;
    body: string;
  }): Promise<ServiceResult<SendMessageResult>> {
    const trimmed = body.trim();
    if (!trimmed) {
      return {
        data: null,
        error: {
          context: "send interview message",
          message: "Please enter a message before sending.",
        },
      };
    }

    const userMessageResult = await this.resolveRequired(
      () =>
        this.client
          .from("interview_messages")
          .insert({
            interview_id: interviewId,
            author: "user",
            body: trimmed,
          })
          .select("*")
          .single(),
      "record user interview message",
    );
    if (userMessageResult.error) {
      return userMessageResult;
    }

    const createdEntry = await this.maybeCreateInterviewEntry(
      userId,
      interviewId,
      trimmed,
    );
    if (createdEntry.error) {
      return { data: null, error: createdEntry.error };
    }

    const interviewerMessageResult = await this.resolveRequired(
      () =>
        this.client
          .from("interview_messages")
          .insert({
            interview_id: interviewId,
            author: "chat_interviewer",
            body: this.formatInterviewerReply(trimmed, createdEntry.data),
          })
          .select("*")
          .single(),
      "record interviewer reply",
    );
    if (interviewerMessageResult.error) {
      return interviewerMessageResult as ServiceResult<SendMessageResult>;
    }

    return {
      data: {
        userMessage: userMessageResult.data,
        interviewerMessage: interviewerMessageResult.data,
        createdEntryId: createdEntry.data?.id ?? null,
      },
      error: null,
    };
  }

  private async maybeCreateInterviewEntry(
    userId: string,
    interviewId: string,
    body: string,
  ): Promise<ServiceResult<ChapterEntryRow | null>> {
    const triggerPhrase = body.toLowerCase();
    if (!triggerPhrase.includes("add new entry")) {
      return { data: null, error: null };
    }

    const chapterResult = await this.resolveMaybe(
      () =>
        this.client
          .from("user_chapters")
          .select("id, title")
          .eq("user_id", userId)
          .order("start_date", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      `find first chapter for ${userId}`,
    );
    if (chapterResult.error) {
      return { data: null, error: chapterResult.error };
    }
    if (!chapterResult.data) {
      return {
        data: null,
        error: {
          context: "create chat entry",
          message: "Add a chapter before capturing entries via chat.",
        },
      };
    }

    const entryTitle = this.buildEntryTitle();
    const summary = `Captured in chat on ${new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
    }).format(new Date())}.`;

    const entryResult = await this.resolveRequired(
      () =>
        this.client
          .from("chapter_entries")
          .insert({
            chapter_id: chapterResult.data!.id,
            entry_type: "story",
            title: entryTitle,
            summary,
            status: "draft",
          })
          .select("*")
          .single(),
      "create chat entry",
    );
    if (entryResult.error) {
      return entryResult;
    }

    const linkResult = await this.resolveRequired(
      () =>
        this.client
          .from("interview_entries")
          .insert({
            interview_id: interviewId,
            entry_id: entryResult.data.id,
          })
          .select("*")
          .single(),
      "link chat entry",
    );
    if (linkResult.error) {
      return { data: null, error: linkResult.error };
    }

    return { data: entryResult.data, error: null };
  }

  private formatInterviewerReply(
    body: string,
    entry: ChapterEntryRow | null,
  ): string {
    if (entry) {
      return `Great reflection! I created a draft entry titled "${entry.title}." Feel free to refine it whenever you like.`;
    }
    if (body.toLowerCase().includes("thank")) {
      return "Always happy to help. What else should we capture?";
    }
    return "Thanks for sharing. Tell me more details or type \"add new entry\" to capture something as a draft.";
  }

  private buildEntryTitle(): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    return `Chat entry - ${formatter.format(new Date())}`;
  }

  private generateInterviewName(): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
    });
    return `Chat · ${formatter.format(new Date())}`;
  }

  private async resolveMaybe<T>(
    executor: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
    context: string,
  ): Promise<ServiceResult<T | null>> {
    try {
      const { data, error } = await executor();
      if (error) {
        return { data: null, error: buildServiceError(context, error) };
      }
      return { data, error: null };
    } catch (unknownError) {
      return {
        data: null,
        error: buildServiceError(
          context,
          unknownError instanceof Error
            ? unknownError
            : new Error("Unknown Supabase error"),
        ),
      };
    }
  }

  private async resolveRequired<T>(
    executor: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
    context: string,
  ): Promise<ServiceResult<T>> {
    const result = await this.resolveMaybe(executor, context);
    if (result.error) {
      return result;
    }
    if (!result.data) {
      return {
        data: null,
        error: buildServiceError(context, null, "Record not found"),
      };
    }
    return { data: result.data, error: null };
  }

  private async resolveList<T>(
    executor: () => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
    context: string,
  ): Promise<ServiceResult<T[]>> {
    try {
      const { data, error } = await executor();
      if (error) {
        return { data: null, error: buildServiceError(context, error) };
      }
      return { data: data ?? [], error: null };
    } catch (unknownError) {
      return {
        data: null,
        error: buildServiceError(
          context,
          unknownError instanceof Error
            ? unknownError
            : new Error("Unknown Supabase error"),
        ),
      };
    }
  }
}

function buildServiceError(
  context: string,
  error: PostgrestError | Error | null,
  fallbackMessage?: string,
): ServiceError {
  if (error && "message" in error && "code" in (error as PostgrestError)) {
    const pgError = error as PostgrestError;
    return {
      message: pgError.message ?? fallbackMessage ?? "Supabase request failed",
      context,
      details: pgError.details ?? undefined,
      hint: pgError.hint ?? undefined,
    };
  }

  const message =
    (error instanceof Error && error.message) ||
    fallbackMessage ||
    "Supabase request failed";

  return { message, context };
}
