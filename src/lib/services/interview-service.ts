import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type {
  InterviewerAgentDebugTrace,
  InterviewerAgentRequestPayload,
} from "@/lib/interviews/debug";
import type { ServiceError, ServiceResult } from "@/lib/services/biography-data-service";
import type { Database, Json } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];

export type UserInterview = Tables["user_interviews"]["Row"];
export type InterviewMessage = Tables["interview_messages"]["Row"];
type InterviewEntryLink = Tables["interview_entries"]["Row"];
type ChapterEntryRow = Tables["chapter_entries"]["Row"];
export type InterviewDebugLog = Tables["interview_message_debug_logs"]["Row"];
export type InterviewMessageEntryAction = {
  action: "created" | "updated";
  entryId: string;
};
export type InterviewMessageMetadata = {
  entryActions?: InterviewMessageEntryAction[];
  [key: string]: Json | undefined;
};

export type InterviewEntryRecord = InterviewEntryLink & {
  chapter_entries: ChapterEntryRow | null;
};

type SendMessageResult = {
  userMessage: InterviewMessage;
  interviewerMessage: InterviewMessage;
  createdEntryIds: string[];
  updatedEntryIds: string[];
};

type CreateInterviewResult = {
  interview: UserInterview;
  openingMessage: InterviewMessage;
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

  async getDebugLogs(interviewId: string): Promise<ServiceResult<InterviewDebugLog[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("interview_message_debug_logs")
          .select("*")
          .eq("interview_id", interviewId)
          .order("created_at", { ascending: true }),
      `load interview debug logs ${interviewId}`,
    );
  }

  async createInterview(): Promise<ServiceResult<CreateInterviewResult>> {
    return this.postJson<CreateInterviewResult>(
      "/api/interviewer/interviews",
      "create interview",
    );
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

  async sendUserMessage(payload: {
    interviewId: string;
    body: string;
  }): Promise<ServiceResult<SendMessageResult>> {
    const trimmed = payload.body.trim();
    if (!trimmed) {
      return {
        data: null,
        error: {
          context: "send interview message",
          message: "Please enter a message before sending.",
        },
      };
    }

    return this.postJson<SendMessageResult>(
      "/api/interviewer/messages",
      "send interview message",
      {
        interviewId: payload.interviewId,
        body: trimmed,
      },
    );
  }

  async previewDebugRequest(payload: {
    interviewId: string;
    request: InterviewerAgentRequestPayload;
  }): Promise<ServiceResult<InterviewerAgentDebugTrace>> {
    return this.postJson<InterviewerAgentDebugTrace>(
      "/api/interviewer/debug",
      "preview interviewer request",
      payload,
    );
  }

  private async postJson<T>(
    path: string,
    context: string,
    body?: Record<string, unknown>,
  ): Promise<ServiceResult<T>> {
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          data: null,
          error: {
            context,
            message:
              typeof payload.error === "string"
                ? payload.error
                : "Request failed. Try again.",
          },
        };
      }

      return { data: payload as T, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          context,
          message:
            error instanceof Error
              ? error.message
              : "Could not perform this action.",
        },
      };
    }
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

export function parseInterviewMessageMetadata(
  metadata: InterviewMessage["metadata"],
): InterviewMessageMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const normalized = metadata as InterviewMessageMetadata;
  const entryActions = Array.isArray(normalized.entryActions)
    ? normalized.entryActions.filter(isInterviewMessageEntryAction)
    : undefined;

  return {
    ...normalized,
    ...(entryActions ? { entryActions } : {}),
  };
}

function isInterviewMessageEntryAction(
  value: unknown,
): value is InterviewMessageEntryAction {
  return (
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    "entryId" in value &&
    (value.action === "created" || value.action === "updated") &&
    typeof value.entryId === "string"
  );
}
