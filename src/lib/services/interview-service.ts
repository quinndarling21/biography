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
export type InterviewMode = Database["public"]["Enums"]["user_interview_mode"];
export type InterviewMessageAuthor = Database["public"]["Enums"]["interview_message_author"];
type InterviewEntryLink = Tables["interview_entries"]["Row"];
type ChapterEntryRow = Tables["chapter_entries"]["Row"];
export type InterviewDebugLog = Tables["interview_message_debug_logs"]["Row"];
export type InterviewRealtimeEvent = Tables["interview_realtime_events"]["Row"];
export type InterviewRealtimeEventOrigin =
  Database["public"]["Enums"]["interview_realtime_event_origin"];
export type InterviewMessageEntryAction = {
  action: "created" | "updated";
  entryId: string;
};
export type InterviewMessageRealtimeToolCall = {
  name: string;
  callId?: string | null;
};
export type InterviewMessageRealtimeMetadata = {
  source?: InterviewMode;
  itemId?: string | null;
  responseId?: string | null;
  order?: number;
  stage?: "opening" | "follow_up" | "closing";
  toolCalls?: InterviewMessageRealtimeToolCall[];
};
export type InterviewMessageMetadata = {
  entryActions?: InterviewMessageEntryAction[];
  realtime?: InterviewMessageRealtimeMetadata;
  conversation?: {
    ended?: boolean;
  };
  [key: string]: Json | undefined;
};
export type InterviewRealtimeEventInput = {
  origin: InterviewRealtimeEventOrigin;
  type: string;
  summary?: string | null;
  payload?: Json;
  interviewMessageId?: string | null;
};
export type VoiceSessionTokenResult = {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  shouldStartOpeningTurn: boolean;
  interview: UserInterview;
};
export type VoiceToolExecutionResult = {
  output: Json;
  createdEntryIds: string[];
  updatedEntryIds: string[];
  closedInterview: boolean;
  interview: UserInterview | null;
};
export type PersistVoiceMessageResult = {
  message: InterviewMessage;
  interview: UserInterview | null;
};

export type InterviewEntryRecord = InterviewEntryLink & {
  chapter_entries: ChapterEntryRow | null;
};

type SendMessageResult = {
  userMessage: InterviewMessage;
  interviewerMessage: InterviewMessage;
  createdEntryIds: string[];
  updatedEntryIds: string[];
  closedInterview: boolean;
  interview: UserInterview | null;
};

type CreateInterviewResult = {
  interview: UserInterview;
  openingMessage: InterviewMessage | null;
};

export class InterviewService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listInterviews(
    userId: string,
    options: { mode?: InterviewMode } = {},
  ): Promise<ServiceResult<UserInterview[]>> {
    return this.resolveList(
      async () => {
        let query = this.client
          .from("user_interviews")
          .select("*")
          .eq("user_id", userId);

        if (options.mode) {
          query = query.eq("mode", options.mode);
        }

        return query.order("created_at", { ascending: false });
      },
      `list interviews for ${userId}`,
    );
  }

  async getMessages(interviewId: string): Promise<ServiceResult<InterviewMessage[]>> {
    const result = await this.resolveList(
      () =>
        this.client
          .from("interview_messages")
          .select("*")
          .eq("interview_id", interviewId)
          .order("sequence", { ascending: true }),
      `load interview messages ${interviewId}`,
    );

    if (result.error || !result.data) {
      return result;
    }

    return {
      data: sortInterviewMessages(result.data),
      error: null,
    };
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

  async getRealtimeEvents(
    interviewId: string,
  ): Promise<ServiceResult<InterviewRealtimeEvent[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("interview_realtime_events")
          .select("*")
          .eq("interview_id", interviewId)
          .order("sequence", { ascending: true }),
      `load realtime interview events ${interviewId}`,
    );
  }

  async createInterview(
    options: { mode?: InterviewMode } = {},
  ): Promise<ServiceResult<CreateInterviewResult>> {
    return this.postJson<CreateInterviewResult>(
      "/api/interviewer/interviews",
      "create interview",
      options.mode ? { mode: options.mode } : undefined,
    );
  }

  async createVoiceSessionToken(payload: {
    interviewId: string;
  }): Promise<ServiceResult<VoiceSessionTokenResult>> {
    return this.postJson<VoiceSessionTokenResult>(
      "/api/interviewer/voice/token",
      "create voice session token",
      payload,
    );
  }

  async executeVoiceTool(payload: {
    interviewId: string;
    toolName: string;
    callId?: string | null;
    args: Record<string, Json | undefined>;
  }): Promise<ServiceResult<VoiceToolExecutionResult>> {
    return this.postJson<VoiceToolExecutionResult>(
      "/api/interviewer/voice/tool",
      "execute voice interviewer tool",
      payload,
    );
  }

  async persistVoiceMessage(payload: {
    interviewId: string;
    author: InterviewMessageAuthor;
    body: string;
    metadata?: InterviewMessageMetadata | null;
  }): Promise<ServiceResult<PersistVoiceMessageResult>> {
    return this.postJson<PersistVoiceMessageResult>(
      "/api/interviewer/voice/messages",
      "persist voice interview message",
      payload,
    );
  }

  async logRealtimeEvents(payload: {
    interviewId: string;
    events: InterviewRealtimeEventInput[];
  }): Promise<ServiceResult<{ count: number }>> {
    return this.postJson<{ count: number }>(
      "/api/interviewer/voice/events",
      "log realtime interview events",
      payload,
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
  const realtime = isInterviewMessageRealtimeMetadata(normalized.realtime)
    ? normalized.realtime
    : undefined;

  return {
    ...normalized,
    ...(entryActions ? { entryActions } : {}),
    ...(realtime ? { realtime } : {}),
  };
}

export function getInterviewMessageConversationOrder(
  message: Pick<InterviewMessage, "metadata" | "sequence">,
): number {
  const order = parseInterviewMessageMetadata(message.metadata).realtime?.order;
  return typeof order === "number" && Number.isFinite(order)
    ? order
    : message.sequence;
}

export function sortInterviewMessages<T extends Pick<InterviewMessage, "metadata" | "sequence">>(
  messages: T[],
): T[] {
  return [...messages].sort((left, right) => {
    const leftOrder = getInterviewMessageConversationOrder(left);
    const rightOrder = getInterviewMessageConversationOrder(right);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.sequence - right.sequence;
  });
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

function isInterviewMessageRealtimeMetadata(
  value: unknown,
): value is InterviewMessageRealtimeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as InterviewMessageRealtimeMetadata;
  const validSource =
    candidate.source === undefined ||
    candidate.source === "chat" ||
    candidate.source === "voice";
  const validOrder =
    candidate.order === undefined ||
    (typeof candidate.order === "number" && Number.isFinite(candidate.order));
  const validStage =
    candidate.stage === undefined ||
    candidate.stage === "opening" ||
    candidate.stage === "follow_up" ||
    candidate.stage === "closing";
  const validToolCalls =
    candidate.toolCalls === undefined ||
    (Array.isArray(candidate.toolCalls) &&
      candidate.toolCalls.every(isInterviewMessageRealtimeToolCall));

  return validSource && validOrder && validStage && validToolCalls;
}

function isInterviewMessageRealtimeToolCall(
  value: unknown,
): value is InterviewMessageRealtimeToolCall {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    (!("callId" in value) ||
      value.callId === null ||
      typeof value.callId === "string")
  );
}
