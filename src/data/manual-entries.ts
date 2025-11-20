import type {
  ChapterEntry,
  ChapterEntryDateGranularity,
  ChapterEntryInsert,
  ChapterEntryUpdate,
  ChapterEntryStatus,
  ChapterEntryType,
  UserChapter,
  UserChapterInsert,
  UserChapterUpdate,
} from "@/lib/services/biography-data-service";
import type { Json } from "@/lib/supabase/types";

export type ManualEntryBody = {
  detail?: string;
  [key: string]: Json | undefined;
};

type ManualEntryBase = {
  chapterId: string;
  title: string;
  summary?: string | null;
  entryDate?: string | null;
  dateGranularity?: ChapterEntryDateGranularity;
  status?: ChapterEntryStatus;
  details?: string | null;
  body?: ManualEntryBody;
};

export type ManualMilestone = ManualEntryBase & {
  type: Extract<ChapterEntryType, "milestone">;
};

export type ManualMemory = ManualEntryBase & {
  type: Extract<ChapterEntryType, "memory">;
};

export type ManualStory = ManualEntryBase & {
  type: Extract<ChapterEntryType, "story">;
};

export type ManualEntryDraft = ManualMilestone | ManualMemory | ManualStory;

export type ManualEntryRecord = ManualEntryDraft & {
  id: string;
};

export type ChapterDraft = {
  title: string;
  description?: string | null;
};

export function manualEntryDraftToInsert(
  draft: ManualEntryDraft,
): ChapterEntryInsert {
  const normalizedBody: ManualEntryBody = {
    ...(draft.body ?? {}),
  };

  if (draft.details) {
    normalizedBody.detail = draft.details;
  }

  return {
    chapter_id: draft.chapterId,
    entry_type: draft.type,
    title: draft.title.trim(),
    summary: nullableTrim(draft.summary),
    entry_date: normalizeDate(draft.entryDate),
    date_granularity: draft.dateGranularity ?? "day",
    status: draft.status ?? "draft",
    body: normalizedBody,
  };
}

export function manualEntryDraftToUpdate(
  draft: ManualEntryDraft,
): ChapterEntryUpdate {
  const normalizedBody: ManualEntryBody = {
    ...(draft.body ?? {}),
  };

  if (draft.details) {
    normalizedBody.detail = draft.details;
  }

  return {
    chapter_id: draft.chapterId,
    entry_type: draft.type,
    title: draft.title.trim(),
    summary: nullableTrim(draft.summary),
    entry_date: normalizeDate(draft.entryDate),
    date_granularity: draft.dateGranularity ?? "day",
    status: draft.status ?? "draft",
    body: normalizedBody,
  };
}

export function chapterEntryToManualRecord(
  entry: ChapterEntry,
): ManualEntryRecord {
  const body = parseBody(entry.body);

  return {
    id: entry.id,
    chapterId: entry.chapter_id,
    type: entry.entry_type,
    title: entry.title,
    summary: entry.summary ?? "",
    entryDate: entry.entry_date,
    dateGranularity: entry.date_granularity,
    status: entry.status,
    details: typeof body.detail === "string" ? body.detail : undefined,
    body,
  };
}

export function chapterDraftToInsert(
  userId: string,
  draft: ChapterDraft,
  options: { position?: number } = {},
): UserChapterInsert {
  return {
    user_id: userId,
    title: draft.title.trim(),
    description: nullableTrim(draft.description),
    position: typeof options.position === "number" ? options.position : 0,
  };
}

export function chapterDraftToUpdate(
  draft: ChapterDraft,
): UserChapterUpdate {
  const payload: UserChapterUpdate = {};

  if (typeof draft.title === "string") {
    payload.title = draft.title.trim();
  }

  if (draft.description !== undefined) {
    payload.description = nullableTrim(draft.description);
  }

  return payload;
}

function nullableTrim(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDate(value?: string | null) {
  if (!value) {
    return null;
  }
  return value;
}

function parseBody(body: ChapterEntry["body"]): ManualEntryBody {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as ManualEntryBody;
  }
  return {};
}

export function chapterToDraft(chapter: UserChapter): ChapterDraft {
  return {
    title: chapter.title,
    description: chapter.description,
  };
}
