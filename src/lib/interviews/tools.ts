import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import type { InterviewEntryRecord } from "@/lib/services/interview-service";
import type { InterviewChapterSummary } from "@/lib/interviews/context";
import type { InterviewEntryMetadata } from "@/config/prompts/interviewer-agent";

type ToolTracker = {
  createdEntries: string[];
  updatedEntries: string[];
};

type InterviewToolContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  interviewId: string;
  chapters: InterviewChapterSummary[];
  entries: InterviewEntryRecord[];
};

const baseEntrySchema = {
  title: z
    .string()
    .min(6, "Use a descriptive title the user will recognize.")
    .describe("Title for the memory entry."),
  summary: z
    .string()
    .min(12, "Summaries should include the key moments and feelings.")
    .describe("Short summary for the entry."),
  detail: z
    .string()
    .nullish()
    .describe("Long-form detail or excerpt captured from the conversation."),
  entryDate: z
    .string()
    .nullish()
    .describe("ISO date (YYYY-MM-DD) or descriptive year/month if exact date unknown."),
  timeline: z
    .string()
    .nullish()
    .describe("Context about when this memory occurred (season, age, etc.)."),
  location: z
    .string()
    .nullish()
    .describe("Location of the memory."),
  participants: z
    .array(z.string())
    .nullish()
    .describe("Key people involved in the memory."),
  emotions: z
    .array(z.string())
    .nullish()
    .describe("Emotions expressed by the user."),
  takeaways: z
    .array(z.string())
    .nullish()
    .describe("Important lessons or reflections."),
  chapterId: z
    .string()
    .nullish()
    .describe("UUID of the chapter to store the entry."),
  chapterTitle: z
    .string()
    .nullish()
    .describe("If you do not know the chapterId, provide the chapter title instead."),
};

export function buildInterviewTools(
  context: InterviewToolContext,
): { tools: DynamicStructuredTool[]; tracker: ToolTracker } {
  const tracker: ToolTracker = { createdEntries: [], updatedEntries: [] };

  const createEntryTool = new DynamicStructuredTool({
    name: "create_interview_entry",
    description:
      "Use this tool to create a new chapter entry when the user has shared a well-defined memory with timeline, emotions, and takeaways.",
    schema: z.object(baseEntrySchema),
    func: async (input) => {
      const chapterId = resolveChapterId(
        context.chapters,
        input.chapterId,
        input.chapterTitle,
      );
      if (!chapterId) {
        return "No available chapter for this user. Ask the user to create one in the builder.";
      }

      const metadata: InterviewEntryMetadata = buildEntryMetadata(input);

      const insertPayload = {
        chapter_id: chapterId,
        entry_type: "story" as const,
        title: input.title.trim(),
        summary: input.summary.trim(),
        entry_date: normalizeDate(input.entryDate),
        date_granularity: "day" as const,
        status: "draft" as const,
        body: metadata as Json,
      };

      const entryResult = await context.supabase
        .from("chapter_entries")
        .insert(insertPayload)
        .select("*")
        .single();

      if (entryResult.error || !entryResult.data) {
        return `Failed to create entry: ${entryResult.error?.message ?? "unknown error"}`;
      }

      const entry = entryResult.data;

      const linkResult = await context.supabase
        .from("interview_entries")
        .insert({
          interview_id: context.interviewId,
          entry_id: entry.id,
        })
        .select("*")
        .single();

      if (linkResult.error) {
        return `Entry created but linking failed: ${linkResult.error.message}`;
      }

      tracker.createdEntries.push(entry.id);
      return `Draft entry ${entry.id} created (${entry.title}).`;
    },
  });

  const updateEntryTool = new DynamicStructuredTool({
    name: "update_interview_entry",
    description:
      "Use this tool to enrich an existing entry with new detail, timeline, emotional context, or to adjust its title/summary.",
    schema: z.object({
      entryId: z
        .string()
        .min(1, "Specify the entry identifier from the context list.")
        .describe("ID of the entry to update."),
      ...baseEntrySchema,
    }),
    func: async (input) => {
      const entryId = input.entryId.trim();
      const entry = await loadInterviewEntry(context, entryId);
      if (!entry) {
        return `Entry ${entryId} not found for this interview.`;
      }

      const metadata: InterviewEntryMetadata = {
        ...(entry.body && typeof entry.body === "object" ? entry.body : {}),
        ...buildEntryMetadata(input),
      };

      const chapterId =
        resolveChapterId(context.chapters, input.chapterId, input.chapterTitle) ??
        entry.chapter_id;

      const updatePayload = {
        chapter_id: chapterId,
        title: input.title ? input.title.trim() : entry.title,
        summary: input.summary ? input.summary.trim() : entry.summary,
        entry_date: input.entryDate
          ? normalizeDate(input.entryDate)
          : entry.entry_date,
        body: metadata as Json,
      };

      const result = await context.supabase
        .from("chapter_entries")
        .update(updatePayload)
        .eq("id", entryId)
        .select("*")
        .single();

      if (result.error || !result.data) {
        return `Failed to update entry ${entryId}: ${
          result.error?.message ?? "unknown error"
        }`;
      }

      tracker.updatedEntries.push(entryId);
      return `Entry ${entryId} updated with the latest story details.`;
    },
  });

  return { tools: [createEntryTool, updateEntryTool], tracker };
}

async function loadInterviewEntry(
  context: InterviewToolContext,
  entryId: string,
) {
  const result = await context.supabase
    .from("interview_entries")
    .select("*, chapter_entries(*)")
    .eq("interview_id", context.interviewId)
    .eq("entry_id", entryId)
    .maybeSingle();

  return (result.data as InterviewEntryRecord | null)?.chapter_entries ?? null;
}

function resolveChapterId(
  chapters: InterviewChapterSummary[],
  preferredId?: string | null,
  preferredTitle?: string | null,
) {
  if (preferredId) {
    const match = chapters.find((chapter) => chapter.id === preferredId);
    if (match) {
      return match.id;
    }
  }

  if (preferredTitle) {
    const normalized = preferredTitle.trim().toLowerCase();
    const match = chapters.find(
      (chapter) => chapter.title.trim().toLowerCase() === normalized,
    );
    if (match) {
      return match.id;
    }
  }

  return chapters[0]?.id ?? null;
}

function buildEntryMetadata(input: Record<string, unknown>): InterviewEntryMetadata {
  const metadata: InterviewEntryMetadata = {};

  if (typeof input.detail === "string" && input.detail.trim()) {
    metadata.detail = input.detail.trim();
  }

  if (typeof input.timeline === "string" && input.timeline.trim()) {
    metadata.timeline = input.timeline.trim();
  }

  if (typeof input.location === "string" && input.location.trim()) {
    metadata.location = input.location.trim();
  }

  if (Array.isArray(input.participants) && input.participants.length) {
    metadata.people = input.participants
      .map((person) => (typeof person === "string" ? person.trim() : ""))
      .filter(Boolean);
  }

  if (Array.isArray(input.emotions) && input.emotions.length) {
    metadata.emotions = input.emotions
      .map((emotion) => (typeof emotion === "string" ? emotion.trim() : ""))
      .filter(Boolean);
  }

  if (Array.isArray(input.takeaways) && input.takeaways.length) {
    metadata.takeaways = input.takeaways
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
  }

  return metadata;
}

function normalizeDate(raw?: string | null) {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return trimmed;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}
