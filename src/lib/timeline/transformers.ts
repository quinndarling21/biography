import type { Chapter, ChapterEntry as ChapterEntryView } from "@/data/chapters";
import type {
  ChapterEntry,
  ChapterEntryDateGranularity,
  TimelineChapter,
} from "@/lib/services/biography-data-service";
import type { Json } from "@/lib/supabase/types";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  timeZone: "UTC",
});

export function mapTimelineToChapters(timeline: TimelineChapter[]): Chapter[] {
  return timeline.map(({ chapter, entries }, index) => ({
    id: chapter.id,
    number: index + 1,
    title: chapter.title,
    summary: chapter.description ?? "",
    entries: entries
      .filter((entry) => entry.status !== "archived")
      .map(mapEntryToView),
  }));
}

function mapEntryToView(entry: ChapterEntry): ChapterEntryView {
  const details = extractDetail(entry.body);
  return {
    id: entry.id,
    chapterId: entry.chapter_id,
    title: entry.title,
    dateLabel: formatEntryDateLabel(entry.entry_date, entry.date_granularity),
    type: entry.entry_type,
    summary: entry.summary ?? "",
    details,
    status: entry.status,
    entryDate: entry.entry_date,
    dateGranularity: entry.date_granularity,
  };
}

export function formatEntryDateLabel(
  date: string | null,
  granularity: ChapterEntryDateGranularity,
): string {
  if (!date) {
    return "Undated";
  }
  const value = new Date(date);
  switch (granularity) {
    case "day":
      return DAY_FORMATTER.format(value);
    case "month":
      return MONTH_FORMATTER.format(value);
    case "year":
      return YEAR_FORMATTER.format(value);
    default:
      return DAY_FORMATTER.format(value);
  }
}

function extractDetail(body: Json | undefined): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const detailValue = (body as Record<string, Json | undefined>).detail;
  return typeof detailValue === "string" ? detailValue : undefined;
}
