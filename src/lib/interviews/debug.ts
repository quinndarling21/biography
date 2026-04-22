import type { Json } from "@/lib/supabase/types";

export type SerializedToolCall = {
  id: string | null;
  name: string;
  args: Record<string, Json | undefined>;
};

export type SerializedLlmMessage = {
  role: "system" | "user" | "assistant" | "tool" | "unknown";
  content: string;
  toolCallId?: string | null;
  toolCalls?: SerializedToolCall[];
};

export type ToolInvocationTrace = {
  step: number;
  toolName: string;
  toolCallId: string | null;
  args: Record<string, Json | undefined>;
  result: string;
};

export type LlmDebugIteration = {
  step: number;
  request: SerializedLlmMessage[];
  response: SerializedLlmMessage;
};

export type InterviewerAgentRequestPayload = {
  model: string;
  temperature: number;
  messages: SerializedLlmMessage[];
};

export type InterviewerAgentResponsePayload = {
  message: SerializedLlmMessage;
};

export type InterviewerAgentDebugTrace = {
  request: InterviewerAgentRequestPayload;
  response: InterviewerAgentResponsePayload;
  metadata: {
    iterations: LlmDebugIteration[];
    toolRuns: ToolInvocationTrace[];
  };
};
