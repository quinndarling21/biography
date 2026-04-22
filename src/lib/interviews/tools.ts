import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import type { InterviewEntryRecord } from "@/lib/services/interview-service";
import type { InterviewChapterSummary } from "@/lib/interviews/context";
import type { InterviewEntryMetadata } from "@/config/prompts/interviewer-agent";
import type {
  ChapterEntryDateGranularity,
  ChapterEntryType,
} from "@/lib/services/biography-data-service";

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

const entryFieldsSchema = {
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
  entryYear: z
    .coerce.number()
    .int()
    .min(1800)
    .max(2100)
    .nullish()
    .describe("4 digit year like 1996 or 2010."),
  entryMonth: z
    .coerce.number()
    .int()
    .min(1)
    .max(12)
    .nullish()
    .describe("Month number (1-12). Provide only when the year is known."),
  entryDay: z
    .coerce.number()
    .int()
    .min(1)
    .max(31)
    .nullish()
    .describe("Day of month (1-31). Provide only when the month is known."),
  chapterId: z
    .string()
    .nullish()
    .describe("UUID of the chapter to store the entry."),
  chapterTitle: z
    .string()
    .nullish()
    .describe("If you do not know the chapterId, provide the chapter title instead."),
};

const entryTypeSchema = z.enum(["milestone", "memory", "story"]);

const createEntrySchema = z.object({
  ...entryFieldsSchema,
  entryType: entryTypeSchema.describe(
    "Select the most appropriate entry category: milestone (major event), memory (snapshot), or story (long-form narrative).",
  ),
});

const updateEntrySchema = z.object({
  entryId: z
    .string()
    .min(1, "Specify the entry identifier from the context list.")
    .describe("ID of the entry to update."),
  ...entryFieldsSchema,
  entryType: entryTypeSchema
    .nullish()
    .describe("Optionally change the entry type if the conversation reframed it."),
});

export function buildInterviewTools(
  context: InterviewToolContext,
): { tools: DynamicStructuredTool[]; tracker: ToolTracker } {
  const tracker: ToolTracker = { createdEntries: [], updatedEntries: [] };

  const createEntryTool = new DynamicStructuredTool({
    name: "create_interview_entry",
    description:
      "Use this tool to create a new chapter entry when the user has shared a well-defined story, memory or milestone.",
    schema: createEntrySchema,
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

      const { entryDate, dateGranularity } = deriveEntryDateFields(input);

      const insertPayload = {
        chapter_id: chapterId,
        entry_type: input.entryType as ChapterEntryType,
        title: input.title.trim(),
        summary: input.summary.trim(),
        entry_date: entryDate,
        date_granularity: dateGranularity,
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
    schema: updateEntrySchema,
    func: async (input) => {
      const entryId = input.entryId.trim();
      const entry = await loadInterviewEntry(context, entryId);
      if (!entry) {
        return `Entry ${entryId} not found for this interview.`;
      }

      const metadata: InterviewEntryMetadata = {
        ...(entry.body &&
        typeof entry.body === "object" &&
        !Array.isArray(entry.body)
          ? (entry.body as InterviewEntryMetadata)
          : {}),
        ...buildEntryMetadata(input),
      };

      const chapterId =
        resolveChapterId(context.chapters, input.chapterId, input.chapterTitle) ??
        entry.chapter_id;

      const { entryDate, dateGranularity } = deriveEntryDateFields(input, {
        entry_date: entry.entry_date,
        date_granularity: entry.date_granularity,
      });

      const updatePayload = {
        chapter_id: chapterId,
        title: input.title ? input.title.trim() : entry.title,
        summary: input.summary ? input.summary.trim() : entry.summary,
        entry_date: entryDate,
        date_granularity: dateGranularity,
        entry_type: (input.entryType as ChapterEntryType | null) ?? entry.entry_type,
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


  return metadata;
}

function deriveEntryDateFields(
  input: {
    entryYear?: number | null;
    entryMonth?: number | null;
    entryDay?: number | null;
  },
  fallback?: {
    entry_date: string | null;
    date_granularity: ChapterEntryDateGranularity;
  },
): { entryDate: string | null; dateGranularity: ChapterEntryDateGranularity } {
  const provided =
    input.entryYear !== undefined ||
    input.entryMonth !== undefined ||
    input.entryDay !== undefined;

  if (!provided && fallback) {
    return {
      entryDate: fallback.entry_date,
      dateGranularity: fallback.date_granularity,
    };
  }

  const year =
    typeof input.entryYear === "number" && Number.isFinite(input.entryYear)
      ? Math.trunc(input.entryYear)
      : null;
  const month =
    typeof input.entryMonth === "number" && Number.isFinite(input.entryMonth)
      ? Math.trunc(input.entryMonth)
      : null;
  const day =
    typeof input.entryDay === "number" && Number.isFinite(input.entryDay)
      ? Math.trunc(input.entryDay)
      : null;

  if (!year) {
    return { entryDate: null, dateGranularity: "day" };
  }

  if (!month) {
    return {
      entryDate: `${year}-01-01`,
      dateGranularity: "year",
    };
  }

  const monthString = `${month}`.padStart(2, "0");

  if (!day) {
    return {
      entryDate: `${year}-${monthString}-01`,
      dateGranularity: "month",
    };
  }

  const dayString = `${day}`.padStart(2, "0");
  return {
    entryDate: `${year}-${monthString}-${dayString}`,
    dateGranularity: "day",
  };
}
