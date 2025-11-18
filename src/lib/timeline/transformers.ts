import type { Chapter, ChapterEntry as ChapterEntryView } from "@/data/chapters";
import type {
  ChapterEntry,
  ChapterEntryDateGranularity,
  TimelineChapter,
} from "@/lib/services/biography-data-service";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
});

const RANGE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

export function mapTimelineToChapters(timeline: TimelineChapter[]): Chapter[] {
  return timeline.map(({ chapter, entries }, index) => ({
    id: chapter.id,
    number: index + 1,
    title: chapter.title,
    period: formatChapterPeriod(chapter.start_date, chapter.end_date),
    summary: chapter.description ?? "",
    entries: entries.map(mapEntryToView),
  }));
}

function mapEntryToView(entry: ChapterEntry): ChapterEntryView {
  return {
    id: entry.id,
    title: entry.title,
    dateLabel: formatEntryDateLabel(entry.entry_date, entry.date_granularity),
    type: entry.entry_type,
    summary: entry.summary ?? "",
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

export function formatChapterPeriod(
  startDate: string | null,
  endDate: string | null,
): string {
  if (!startDate && !endDate) {
    return "Timeline coming soon";
  }
  if (startDate && endDate) {
    return `${formatRangeDate(startDate)} – ${formatRangeDate(endDate)}`;
  }
  const singleDate = startDate ?? endDate;
  return singleDate ? formatRangeDate(singleDate) : "Timeline coming soon";
}

function formatRangeDate(date: string) {
  return RANGE_FORMATTER.format(new Date(date));
}
