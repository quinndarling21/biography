import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";
import type { InterviewEntryRecord } from "@/lib/services/interview-service";
import type { InterviewChapterSummary } from "@/lib/interviews/context";
import type { InterviewEntryMetadata } from "@/config/prompts/interviewer-agent";
import type {
  ChapterEntry,
  ChapterEntryDateGranularity,
  ChapterEntryType,
} from "@/lib/services/biography-data-service";

type ToolTracker = {
  createdEntries: string[];
  updatedEntries: string[];
  closedInterview: boolean;
};

type InterviewToolContext = {
  supabase?: SupabaseClient<Database>;
  userId: string;
  interviewId: string;
  chapters: InterviewChapterSummary[];
  entries: InterviewEntryRecord[];
};

type InterviewToolMode = "live" | "dry-run";

type BuildInterviewToolsOptions = {
  mode?: InterviewToolMode;
};

const entryFieldsSchema = {
  title: z
    .string()
    .min(4, "Use a short title the user will recognize.")
    .describe("Title for the memory entry."),
  summary: z
    .string()
    .min(8, "Summaries should capture the key facts already shared.")
    .describe("Short summary for the entry."),
  detail: z
    .string()
    .nullish()
    .describe("Long-form detail, scene-setting notes, or a vivid excerpt captured from the conversation."),
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
  entryType: entryTypeSchema
    .nullish()
    .describe(
      "Optional. Select the most appropriate entry category: milestone (major event), memory (snapshot), or story (long-form narrative). If omitted, the server will infer a reasonable default.",
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

const completeInterviewSchema = z.object({
  reason: z
    .string()
    .min(6, "Explain briefly why the interview is ready to close.")
    .describe("Short reason for closing the interview."),
  summary: z
    .string()
    .nullish()
    .describe("Optional one-sentence recap of what was captured."),
});

export const interviewRealtimeToolDefinitions = [
  {
    type: "function" as const,
    name: "create_interview_entry",
    description:
      "Create a draft entry immediately when the user introduces a distinct milestone, memory, or story, even if some timeline details are still missing.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title for the memory entry.",
        },
        summary: {
          type: "string",
          description: "Short summary for the entry.",
        },
        detail: {
          type: "string",
          description:
            "Long-form detail, scene-setting notes, or a vivid excerpt captured from the conversation.",
        },
        entryYear: {
          type: "integer",
          description: "4 digit year like 1996 or 2010.",
        },
        entryMonth: {
          type: "integer",
          description: "Month number (1-12). Provide only when the year is known.",
        },
        entryDay: {
          type: "integer",
          description: "Day of month (1-31). Provide only when the month is known.",
        },
        chapterId: {
          type: "string",
          description: "UUID of the chapter to store the entry.",
        },
        chapterTitle: {
          type: "string",
          description: "If you do not know the chapterId, provide the chapter title instead.",
        },
        entryType: {
          type: "string",
          enum: ["milestone", "memory", "story"],
          description:
            "Optional. Select the most appropriate entry category: milestone (major event), memory (snapshot), or story (long-form narrative). If omitted, the server will infer a reasonable default.",
        },
      },
      required: ["title", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "update_interview_entry",
    description:
      "Enrich an existing interview entry when the user keeps elaborating on the same moment, adding timeline, people, feelings, or sharper language.",
    parameters: {
      type: "object",
      properties: {
        entryId: {
          type: "string",
          description: "ID of the entry to update.",
        },
        title: {
          type: "string",
          description: "Updated title for the entry.",
        },
        summary: {
          type: "string",
          description: "Updated summary for the entry.",
        },
        detail: {
          type: "string",
          description:
            "Long-form detail, scene-setting notes, or a vivid excerpt captured from the conversation.",
        },
        entryYear: {
          type: "integer",
          description: "4 digit year like 1996 or 2010.",
        },
        entryMonth: {
          type: "integer",
          description: "Month number (1-12). Provide only when the year is known.",
        },
        entryDay: {
          type: "integer",
          description: "Day of month (1-31). Provide only when the month is known.",
        },
        chapterId: {
          type: "string",
          description: "UUID of the chapter to store the entry.",
        },
        chapterTitle: {
          type: "string",
          description: "If you do not know the chapterId, provide the chapter title instead.",
        },
        entryType: {
          type: "string",
          enum: ["milestone", "memory", "story"],
          description: "Optionally change the entry type if the story was reframed.",
        },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "complete_interview",
    description:
      "Mark the interview complete only when the user clearly indicates they are done or both sides have explicitly wrapped up.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short reason for closing the interview.",
        },
        summary: {
          type: "string",
          description: "Optional one-sentence recap of what was captured.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export function buildInterviewTools(
  context: InterviewToolContext,
  options: BuildInterviewToolsOptions = {},
): { tools: DynamicStructuredTool[]; tracker: ToolTracker } {
  const mode = options.mode ?? "live";
  const tracker: ToolTracker = {
    createdEntries: [],
    updatedEntries: [],
    closedInterview: false,
  };
  const draftEntries = buildDraftEntryCache(context.entries);
  let dryRunEntryCount = 0;

  const createEntryTool = new DynamicStructuredTool({
    name: "create_interview_entry",
    description:
      "Create a draft entry immediately when the user introduces a distinct milestone, memory, or story, even if some timeline details are still missing.",
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
      const entryType = inferEntryType(input);

      const { entryDate, dateGranularity } = deriveEntryDateFields(input);

      const insertPayload = {
        chapter_id: chapterId,
        entry_type: entryType,
        title: input.title.trim(),
        summary: input.summary.trim(),
        entry_date: entryDate,
        date_granularity: dateGranularity,
        status: "draft" as const,
        body: metadata as Json,
      };

      if (mode === "dry-run") {
        const dryRunId = `dry-run-entry-${++dryRunEntryCount}`;
        draftEntries.push({
          id: dryRunId,
          ...insertPayload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        tracker.createdEntries.push(dryRunId);
        return `Dry run: would create draft entry ${dryRunId} (${insertPayload.title}).`;
      }

      if (!context.supabase) {
        return "Failed to create entry: Supabase client unavailable.";
      }

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
      draftEntries.push(entry);
      return `Draft entry ${entry.id} created (${entry.title}).`;
    },
  });

  const updateEntryTool = new DynamicStructuredTool({
    name: "update_interview_entry",
    description:
      "Enrich an existing interview entry when the user keeps elaborating on the same moment, adding timeline, people, feelings, or sharper language.",
    schema: updateEntrySchema,
    func: async (input) => {
      const entryId = input.entryId.trim();
      const entry = loadDraftEntry(draftEntries, entryId);
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

      if (mode === "dry-run") {
        applyDraftEntryUpdate(entry, updatePayload);
        tracker.updatedEntries.push(entryId);
        return `Dry run: would update entry ${entryId} with the latest story details.`;
      }

      if (!context.supabase) {
        return `Failed to update entry ${entryId}: Supabase client unavailable.`;
      }

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

      applyDraftEntryUpdate(entry, updatePayload);
      tracker.updatedEntries.push(entryId);
      return `Entry ${entryId} updated with the latest story details.`;
    },
  });

  const completeInterviewTool = new DynamicStructuredTool({
    name: "complete_interview",
    description:
      "Mark the interview complete only when the user clearly indicates they are done or both sides have explicitly wrapped up.",
    schema: completeInterviewSchema,
    func: async (input) => {
      if (mode === "dry-run") {
        tracker.closedInterview = true;
        return `Dry run: would close the interview. Reason: ${input.reason.trim()}`;
      }

      if (!context.supabase) {
        return "Failed to close interview: Supabase client unavailable.";
      }

      const result = await context.supabase
        .from("user_interviews")
        .update({ status: "closed" })
        .eq("id", context.interviewId)
        .select("id")
        .single();

      if (result.error || !result.data) {
        return `Failed to close interview: ${
          result.error?.message ?? "unknown error"
        }`;
      }

      tracker.closedInterview = true;
      const summary =
        typeof input.summary === "string" && input.summary.trim()
          ? ` Summary: ${input.summary.trim()}`
          : "";
      return `Interview closed. Reason: ${input.reason.trim()}.${summary}`;
    },
  });

  return { tools: [createEntryTool, updateEntryTool, completeInterviewTool], tracker };
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

function inferEntryType(input: {
  entryType?: string | null;
  title: string;
  summary: string;
  detail?: string | null;
}): ChapterEntryType {
  if (input.entryType === "milestone" || input.entryType === "memory" || input.entryType === "story") {
    return input.entryType;
  }

  const title = input.title.trim().toLowerCase();
  const summary = input.summary.trim().toLowerCase();
  const detail = typeof input.detail === "string" ? input.detail.trim().toLowerCase() : "";
  const combined = `${title} ${summary} ${detail}`;

  if (
    /\b(born|birth|graduat|married|wedding|divorc|moved|move to|relocat|accepted|admitted|started|joined|launched|opened|promot|retir|won|award|passed away|died|death|first job|first child)\b/.test(
      combined,
    )
  ) {
    return "milestone";
  }

  const storyLength = detail.length + summary.length;
  const sentenceCount = (detail.match(/[.!?]/g)?.length ?? 0) + (summary.match(/[.!?]/g)?.length ?? 0);

  if (storyLength >= 260 || sentenceCount >= 4) {
    return "story";
  }

  return "memory";
}

function buildDraftEntryCache(entries: InterviewEntryRecord[]): ChapterEntry[] {
  return entries
    .map((record) => record.chapter_entries)
    .filter((entry): entry is ChapterEntry => Boolean(entry))
    .map((entry) => ({ ...entry }));
}

function loadDraftEntry(entries: ChapterEntry[], entryId: string) {
  return entries.find((entry) => entry.id === entryId) ?? null;
}

function applyDraftEntryUpdate(
  entry: ChapterEntry,
  update: {
    chapter_id: string;
    title: string;
    summary: string | null;
    entry_date: string | null;
    date_granularity: ChapterEntryDateGranularity;
    entry_type: ChapterEntryType;
    body: Json;
  },
) {
  entry.chapter_id = update.chapter_id;
  entry.title = update.title;
  entry.summary = update.summary;
  entry.entry_date = update.entry_date;
  entry.date_granularity = update.date_granularity;
  entry.entry_type = update.entry_type;
  entry.body = update.body;
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
