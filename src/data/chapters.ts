export type EntryType = "milestone" | "memory" | "story";

export type ChapterEntry = {
  id: string;
  title: string;
  dateLabel: string;
  type: EntryType;
  summary: string;
};

export type Chapter = {
  id: string;
  number: number;
  title: string;
  period: string;
  summary: string;
  entries: ChapterEntry[];
};
