import { interviewerPromptConfig } from "@/config/prompts/interviewer-agent";
import type { InterviewChapterSummary } from "@/lib/interviews/context";
import type {
  InterviewEntryRecord,
  InterviewMessage,
} from "@/lib/services/interview-service";
import { interviewRealtimeToolDefinitions } from "@/lib/interviews/tools";

type VoiceSessionContext = {
  messages: InterviewMessage[];
  entries: InterviewEntryRecord[];
  chapters: InterviewChapterSummary[];
};

export function buildVoiceRealtimeSession(context: VoiceSessionContext) {
  const turnDetection = interviewerPromptConfig.realtime.turnDetection;
  const inputTurnDetection =
    turnDetection.mode === "semantic_vad"
      ? {
          type: "semantic_vad" as const,
          eagerness: turnDetection.eagerness,
          interrupt_response: turnDetection.interruptResponse,
          create_response: turnDetection.createResponse,
        }
      : {
          type: "server_vad" as const,
          threshold: turnDetection.threshold,
          prefix_padding_ms: turnDetection.prefixPaddingMs,
          silence_duration_ms: turnDetection.silenceDurationMs,
          interrupt_response: turnDetection.interruptResponse,
          create_response: turnDetection.createResponse,
          idle_timeout_ms: turnDetection.idleTimeoutMs,
        };

  return {
    session: {
      type: "realtime",
      model: interviewerPromptConfig.realtime.model,
      instructions: buildVoiceSessionInstructions(context),
      audio: {
        input: {
          noise_reduction: {
            type: "near_field",
          },
          transcription: {
            model: interviewerPromptConfig.realtime.transcriptionModel,
            language: "en",
          },
          turn_detection: inputTurnDetection,
        },
        output: {
          voice: interviewerPromptConfig.realtime.voice,
        },
      },
      tools: interviewRealtimeToolDefinitions,
      tool_choice: "auto",
      truncation: {
        type: "retention_ratio",
        retention_ratio: 0.8,
      },
    },
  };
}

export function buildVoiceOpeningResponse() {
  return {
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      metadata: {
        phase: "opening",
      },
      instructions: [
        interviewerPromptConfig.opening.voiceGuidance,
        `Example prompts: ${interviewerPromptConfig.opening.sampleOpeners.join(" | ")}`,
      ].join(" "),
    },
  };
}

function buildVoiceSessionInstructions(context: VoiceSessionContext) {
  const contextLines = [
    interviewerPromptConfig.systemInstruction,
    interviewerPromptConfig.toolingInstruction,
    interviewerPromptConfig.voiceResponseStyle,
    interviewerPromptConfig.closingInstruction,
    buildChapterSummary(context.chapters),
    buildEntrySummary(context.entries),
    buildRecentTranscriptSummary(context.messages),
  ].filter(Boolean);

  return contextLines.join("\n\n");
}

function buildChapterSummary(chapters: InterviewChapterSummary[]) {
  if (!chapters.length) {
    return "Available chapters: None yet. If the user has no chapters, ask them to create one in the builder before capturing more memories.";
  }

  return `Available chapters: ${chapters
    .map((chapter) => `${chapter.title} (${chapter.id})`)
    .join("; ")}`;
}

function buildEntrySummary(entries: InterviewEntryRecord[]) {
  const chapterEntries = entries
    .map((entry) => entry.chapter_entries)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!chapterEntries.length) {
    return "Existing captured entries: None yet.";
  }

  return `Existing captured entries: ${chapterEntries
    .map((entry) => `${entry.title} [${entry.id}] — ${entry.summary ?? "No summary yet"}`)
    .join("; ")}`;
}

function buildRecentTranscriptSummary(messages: InterviewMessage[]) {
  if (!messages.length) {
    return "Recent conversation: This is a brand-new interview session.";
  }

  const transcript = messages
    .slice(-interviewerPromptConfig.realtime.historyLimit)
    .map((message) => {
      const speaker = message.author === "user" ? "User" : "Walter";
      return `${speaker}: ${message.body}`;
    })
    .join("\n");

  return `Recent conversation transcript:\n${transcript}`;
}
