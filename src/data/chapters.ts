import type {
  ChapterEntryDateGranularity,
  ChapterEntryStatus,
} from "@/lib/services/biography-data-service";

export type EntryType = "milestone" | "memory" | "story";

export type ChapterEntry = {
  id: string;
  chapterId: string;
  title: string;
  dateLabel: string;
  type: EntryType;
  summary: string;
  details?: string;
  status: ChapterEntryStatus;
  entryDate: string | null;
  dateGranularity: ChapterEntryDateGranularity;
};

export type Chapter = {
  id: string;
  number: number;
  title: string;
  period: string;
  summary: string;
  entries: ChapterEntry[];
};
