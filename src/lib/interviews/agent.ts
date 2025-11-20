import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";

import { interviewerPromptConfig } from "@/config/prompts/interviewer-agent";
import type {
  InterviewEntryRecord,
  InterviewMessage,
} from "@/lib/services/interview-service";
import type { InterviewChapterSummary } from "@/lib/interviews/context";
import type { Database } from "@/lib/supabase/types";
import { buildInterviewTools } from "@/lib/interviews/tools";

type RespondInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  interviewId: string;
  messages: InterviewMessage[];
  entries: InterviewEntryRecord[];
  chapters: InterviewChapterSummary[];
};

type RespondResult = {
  reply: string;
  createdEntryIds: string[];
  updatedEntryIds: string[];
};

export class InterviewerAgent {
  private readonly config = interviewerPromptConfig;

  async generateOpeningMessage(): Promise<string> {
    const apiKey = resolveOpenAIKey();
    const opener = new ChatOpenAI({
      apiKey,
      model: this.config.model,
      temperature: this.config.temperature,
    });

    const system = new SystemMessage(
      [
        this.config.systemInstruction,
        this.config.responseStyle,
        this.config.toolingInstruction,
        "Begin a brand-new conversation. Ask one probing question and keep it under 2 sentences.",
        `Example prompts: ${this.config.opening.sampleOpeners.join(" | ")}`,
      ].join(" "),
    );

    const result = await opener.invoke([
      system,
      new HumanMessage(this.config.opening.guidance),
    ]);
    return coerceContentToString(result.content);
  }

  async respond(input: RespondInput): Promise<RespondResult> {
    const apiKey = resolveOpenAIKey();
    const llm = new ChatOpenAI({
      apiKey,
      model: this.config.model,
      temperature: this.config.temperature,
      streaming: false,
    });

    const { tools: toolset, tracker } = buildInterviewTools({
      supabase: input.supabase,
      userId: input.userId,
      interviewId: input.interviewId,
      chapters: input.chapters,
      entries: input.entries,
    });

    const toolMap = new Map<string, DynamicStructuredTool>(
      toolset.map((tool) => [tool.name, tool]),
    );
    const llmWithTools = llm.bindTools(toolset, { parallelToolCalls: false });

    const promptMessages = this.buildPromptMessages(input);
    const finalMessage = await this.runToolLoop(
      llmWithTools,
      toolMap,
      promptMessages,
    );

    return {
      reply: coerceContentToString(finalMessage.content),
      createdEntryIds: tracker.createdEntries,
      updatedEntryIds: tracker.updatedEntries,
    };
  }

  private buildPromptMessages(input: RespondInput): BaseMessage[] {
    const contextSegments = [
      `Available chapters: ${
        input.chapters.length
          ? input.chapters
              .map((chapter) => `${chapter.title} (${chapter.id})`)
              .join("; ")
          : "None yet"
      }`,
    ];

    if (input.entries.length) {
      const entrySummaries = input.entries
        .map((entry) => {
          const chapterEntry = entry.chapter_entries;
          if (!chapterEntry) {
            return null;
          }
          const summary = chapterEntry.summary ?? "No summary yet";
          return `${chapterEntry.title} [${chapterEntry.id}] — ${summary}`;
        })
        .filter(Boolean)
        .join("; ");
      contextSegments.push(`Existing entries: ${entrySummaries}`);
    } else {
      contextSegments.push("No entries have been captured in this interview.");
    }

    const systemMessages: BaseMessage[] = [
      new SystemMessage(this.config.systemInstruction),
      new SystemMessage(this.config.toolingInstruction),
      new SystemMessage(this.config.responseStyle),
      new SystemMessage(contextSegments.join(" ")),
    ];

    const conversationMessages: BaseMessage[] = input.messages.map((message) =>
      message.author === "user"
        ? new HumanMessage(message.body)
        : new AIMessage(message.body),
    );

    return [...systemMessages, ...conversationMessages];
  }

  private async runToolLoop(
    llm: ChatOpenAI,
    tools: Map<string, DynamicStructuredTool>,
    messages: BaseMessage[],
  ) {
    for (let step = 0; step < this.config.maxToolIterations; step += 1) {
      const response = await llm.invoke(messages);
      messages.push(response);

      if (!response.tool_calls?.length) {
        return response;
      }

      for (const toolCall of response.tool_calls) {
        const tool = tools.get(toolCall.name);
        if (!tool) {
          continue;
        }
        const args =
          typeof toolCall.args === "string"
            ? safeJsonParse(toolCall.args)
            : toolCall.args ?? {};
        const result = await tool.invoke(args);

        messages.push(
          new ToolMessage({
            content: typeof result === "string" ? result : JSON.stringify(result),
            tool_call_id: toolCall.id ?? toolCall.name,
          }),
        );
      }
    }

    throw new Error("Interviewer agent exceeded tool iteration limit.");
  }
}

function resolveOpenAIKey() {
  const key =
    process.env.OPENAI_API_KEY ?? null;
  if (!key) {
    throw new Error(
      "Set OPENAI_API_KEY to use the interviewer agent.",
    );
  }
  return key;
}

function safeJsonParse(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function coerceContentToString(
  content: AIMessage["content"] | BaseMessage["content"],
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((segment) => {
        if (typeof segment === "string") {
          return segment;
        }
        if (
          typeof segment === "object" &&
          segment !== null &&
          "type" in segment &&
          segment.type === "text" &&
          typeof segment.text === "string"
        ) {
          return segment.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}
