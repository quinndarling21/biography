import type { UserInterview } from "@/lib/services/interview-service";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const ABSOLUTE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatInterviewTitle(
  interview: Pick<UserInterview, "created_at" | "name">,
  fallbackIndex?: number,
): string {
  const trimmed = interview.name?.trim();
  if (trimmed) {
    return trimmed;
  }
  const createdAt = new Date(interview.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return fallbackIndex ? `Conversation ${fallbackIndex}` : "Conversation";
  }
  return `Chat · ${SHORT_DATE.format(createdAt)}`;
}

export function formatUpdatedLabel(value: string): string {
  const updated = new Date(value);
  if (Number.isNaN(updated.getTime())) {
    return "Recently";
  }
  const now = new Date();
  const diff = now.getTime() - updated.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) {
    return "Today";
  }
  if (diff < day * 2) {
    return "Yesterday";
  }
  if (diff < day * 7) {
    return updated.toLocaleDateString("en-US", { weekday: "long" });
  }
  return updated.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatAbsoluteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return ABSOLUTE_DATE.format(date);
}
