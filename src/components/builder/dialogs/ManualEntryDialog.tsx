import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EntryType } from "@/data/chapters";
import type { ManualEntryDraft, ManualEntryRecord } from "@/data/manual-entries";
import type {
  ChapterEntryDateGranularity,
  ChapterEntryStatus,
  ServiceResult,
  UserChapter,
} from "@/lib/services/biography-data-service";
import { cn } from "@/lib/utils";

import { DialogShell } from "./DialogShell";

type ManualEntryDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  entryType?: EntryType;
  initialEntry?: ManualEntryRecord;
  chapters: UserChapter[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: ManualEntryDraft) => Promise<ServiceResult<unknown>>;
  onArchive?: () => Promise<ServiceResult<unknown>>;
};

type ManualEntryFormState = {
  chapterId: string;
  title: string;
  summary: string;
  details: string;
  year: string;
  month: string;
  day: string;
};

type ActionButtonsProps = {
  mode: "create" | "edit";
  submitting: boolean;
  initialStatus: ChapterEntryStatus;
  hasChanges: boolean;
  hasCreateInput: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive?: () => void;
  onCancel: () => void;
};

const months = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

const days = Array.from({ length: 31 }, (_, index) => {
  const day = index + 1;
  return { value: day.toString().padStart(2, "0"), label: day.toString() };
});

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 150 }, (_, index) => {
  const year = currentYear + 10 - index;
  return year.toString();
});

export function ManualEntryDialog({
  open,
  mode,
  entryType,
  initialEntry,
  chapters,
  submitting,
  onClose,
  onSubmit,
  onArchive,
}: ManualEntryDialogProps) {
  const resolvedType = initialEntry?.type ?? entryType;
  const initialChapterId =
    initialEntry?.chapterId ?? chapters[0]?.id ?? "";

  const [initialSnapshot] = useState<ManualEntryFormState>(() =>
    buildManualEntryState(initialEntry, initialChapterId),
  );
  const [form, setForm] = useState<ManualEntryFormState>(initialSnapshot);
  const [initialStatus] = useState<ChapterEntryStatus>(
    () => initialEntry?.status ?? "draft",
  );
  const [error, setError] = useState<string | null>(null);

  const dateGranularity = useMemo<ChapterEntryDateGranularity>(() => {
    if (form.year && form.month && form.day) {
      return "day";
    }
    if (form.year && form.month) {
      return "month";
    }
    if (form.year) {
      return "year";
    }
    return "day";
  }, [form.year, form.month, form.day]);

  const hasFormChanges = useMemo(() => {
    if (mode !== "edit") {
      return false;
    }
    return (
      initialSnapshot.chapterId !== form.chapterId ||
      initialSnapshot.title !== form.title ||
      initialSnapshot.summary !== form.summary ||
      initialSnapshot.details !== form.details ||
      initialSnapshot.year !== form.year ||
      initialSnapshot.month !== form.month ||
      initialSnapshot.day !== form.day
    );
  }, [form, mode, initialSnapshot]);

  const hasCreateInput = useMemo(() => {
    if (mode !== "create") {
      return false;
    }
    return Boolean(
      form.title.trim() ||
        form.summary.trim() ||
        form.details.trim() ||
        form.year ||
        form.month ||
        form.day,
    );
  }, [form, mode]);

  const shouldWarnOnClose = hasFormChanges || hasCreateInput;

  const statusLabel = initialStatus === "published" ? "Published" : "Draft";
  const statusTone = initialStatus === "published" ? "published" : "draft";
  const statusContainerClass = cn(
    "rounded-2xl border px-4 py-3 text-xs text-[var(--color-text-secondary)] mt-1",
    statusTone === "published"
      ? "bg-[var(--color-accent-primary)]/35 border-[var(--color-accent-primary)]/70"
      : "bg-[var(--color-accent-highlight)]/35 border-[var(--color-accent-highlight)]/70",
    hasFormChanges && "border-[var(--color-text-strong)]/40 shadow-inner",
  );
  const statusPillClass = cn(
    "mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    statusTone === "published"
      ? "bg-[var(--color-accent-primary)] text-[var(--color-text-strong)]"
      : "bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]",
  );
  const statusMessage =
    mode === "edit"
      ? hasFormChanges
        ? initialStatus === "published"
          ? "You have unpublished edits. Save as a draft or publish to update the live entry."
          : "You have edits that aren't saved yet. Save draft or publish to save."
        : initialStatus === "published"
          ? "This entry is currently live."
          : "This entry remains private until you publish it."
      : null;

  const requestClose = () => {
    if (shouldWarnOnClose) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Save a draft or publish before closing, or confirm to discard.",
      );
      if (!confirmClose) {
        return;
      }
    }
    onClose();
  };

  if (!open || !resolvedType) {
    return null;
  }

  const handleSubmit = async (status: ChapterEntryStatus) => {
    if (!form.chapterId) {
      setError("Select a chapter to save this entry.");
      return;
    }
    if (!form.year) {
      setError("Select at least a year for this entry.");
      return;
    }
    setError(null);
    const entryDate = buildDateValue(form.year, form.month, form.day);
    const result = await onSubmit({
      chapterId: form.chapterId,
      type: resolvedType,
      title: form.title,
      summary: form.summary || null,
      details: form.details || null,
      entryDate,
      dateGranularity,
      status,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onClose();
  };

  const handleArchive = async () => {
    if (!onArchive) {
      return;
    }
    const result = await onArchive();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onClose();
  };

  const description =
    mode === "edit"
      ? "Update the content, timeframe, or status of this entry."
      : "Capture a new milestone, memory, or story inside your chapters.";

  return (
    <DialogShell
      open={open}
      title={
        mode === "edit"
          ? `Edit ${capitalize(resolvedType)}`
          : `Add a ${capitalize(resolvedType)}`
      }
      description={description}
      onClose={requestClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit("draft");
        }}
        className="space-y-4"
      >
        {mode === "edit" && statusMessage ? (
          <div className={statusContainerClass}>
            <span className={statusPillClass}>{statusLabel}</span>
            {statusMessage}
          </div>
        ) : null}
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Chapter
          <select
            className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
            value={form.chapterId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                chapterId: event.target.value,
              }))
            }
          >
            <option value="" disabled>
              Select a chapter
            </option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Title
          <input
            required
            className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </label>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Summary
          <textarea
            className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
            rows={3}
            value={form.summary}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, summary: event.target.value }))
            }
          />
        </label>
        <DatePartFields
          year={form.year}
          month={form.month}
          day={form.day}
          onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        />
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Details
          <textarea
            className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
            rows={4}
            value={form.details}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, details: event.target.value }))
            }
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <ActionButtons
          mode={mode}
          submitting={submitting}
          initialStatus={initialStatus}
          hasChanges={hasFormChanges}
          hasCreateInput={hasCreateInput}
          onSaveDraft={() => void handleSubmit("draft")}
          onPublish={() => void handleSubmit("published")}
          onUnpublish={() => void handleSubmit("draft")}
          onArchive={mode === "edit" ? handleArchive : undefined}
          onCancel={requestClose}
        />
      </form>
    </DialogShell>
  );
}

function ActionButtons({
  mode,
  submitting,
  initialStatus,
  hasChanges,
  hasCreateInput,
  onSaveDraft,
  onPublish,
  onUnpublish,
  onArchive,
}: ActionButtonsProps) {
  const isPublished = initialStatus === "published";
  const isDraft = !isPublished;

  const showSaveDraft =
    (mode === "create" && hasCreateInput) ||
    (isDraft && hasChanges) ||
    (isPublished && hasChanges);
  const showPublish =
    (mode === "create" && hasCreateInput) ||
    (mode === "edit" && isDraft) ||
    (mode === "edit" && isPublished && hasChanges);
  const showUnpublish =
    mode === "edit" && isPublished && !hasChanges;
  const saveLabel =
    isPublished && mode === "edit" ? "Save as draft" : "Save draft";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-2 text-left sm:flex-row sm:items-center sm:gap-4">
        {mode === "edit" && onArchive ? (
          <button
            type="button"
            onClick={onArchive}
            className="text-sm font-semibold text-red-600 underline-offset-4 hover:underline"
          >
            Archive entry
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        {showSaveDraft ? (
          <Button
            type="button"
            size="md"
            variant="secondary"
            disabled={submitting}
            className="text-sm"
            onClick={onSaveDraft}
          >
            {saveLabel}
          </Button>
        ) : null}
        {showUnpublish ? (
          <Button
            type="button"
            size="md"
            disabled={submitting}
            onClick={onUnpublish}
          >
            Unpublish
          </Button>
        ) : null}
        {showPublish ? (
          <Button
            type="button"
            size="md"
            disabled={submitting}
            onClick={onPublish}
          >
            Publish
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type DateFieldChanges = Partial<Pick<ManualEntryFormState, "year" | "month" | "day">>;

function DatePartFields({
  year,
  month,
  day,
  onChange,
}: {
  year: string;
  month: string;
  day: string;
  onChange: (changes: DateFieldChanges) => void;
}) {
  const handleYearChange = (nextYear: string) => {
    if (!nextYear) {
      onChange({ year: "", month: "", day: "" });
      return;
    }
    onChange({ year: nextYear });
  };

  const handleMonthChange = (nextMonth: string) => {
    if (!nextMonth) {
      onChange({ month: "", day: "" });
      return;
    }
    onChange({ month: nextMonth });
  };

  const handleDayChange = (nextDay: string) => {
    onChange({ day: nextDay });
  };

  const monthDisabled = !year;
  const dayDisabled = !year || !month;
  const labelClass = (disabled: boolean) =>
    cn(
      "block text-sm font-medium text-[var(--color-text-secondary)] transition-colors",
      disabled && "text-[var(--color-text-muted)]/70",
    );
  const selectClass = (disabled: boolean) =>
    cn(
      "mt-1 w-full rounded-2xl border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-subtle)]",
      disabled
        ? "cursor-not-allowed border-[var(--color-border-subtle)] bg-[var(--color-border-subtle)]/20 text-[var(--color-text-secondary)]/60"
        : "border-[var(--color-border-subtle)] bg-white text-[var(--color-text-strong)]",
    );

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className={labelClass(false)}>
        Year
        <select
          className={selectClass(false)}
          value={year}
          onChange={(event) => handleYearChange(event.target.value)}
        >
          <option value="">Select year</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass(monthDisabled)}>
        Month
        <select
          className={selectClass(monthDisabled)}
          value={month}
          disabled={monthDisabled}
          onChange={(event) => handleMonthChange(event.target.value)}
        >
          <option value="">Select month</option>
          {months.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass(dayDisabled)}>
        Day
        <select
          className={selectClass(dayDisabled)}
          value={day}
          disabled={dayDisabled}
          onChange={(event) => handleDayChange(event.target.value)}
        >
          <option value="">Select day</option>
          {days.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function buildDateValue(year: string, month: string, day: string) {
  const resolvedMonth = month || "01";
  const resolvedDay = day || "01";
  return `${year}-${resolvedMonth}-${resolvedDay}`;
}

function buildManualEntryState(
  entry: ManualEntryRecord | undefined,
  defaultChapterId: string,
): ManualEntryFormState {
  const { year, month, day } = deriveDateParts(
    entry?.entryDate ?? null,
    entry?.dateGranularity ?? "day",
  );
  return {
    chapterId: entry?.chapterId ?? defaultChapterId,
    title: entry?.title ?? "",
    summary: entry?.summary ?? "",
    details: entry?.details ?? "",
    year,
    month,
    day,
  };
}

function deriveDateParts(
  value: string | null,
  granularity: ChapterEntryDateGranularity,
) {
  if (!value) {
    return { year: "", month: "", day: "" };
  }
  const [year, month = "", day = ""] = value.split("-");
  if (granularity === "year") {
    return { year: year ?? "", month: "", day: "" };
  }
  if (granularity === "month") {
    return { year: year ?? "", month, day: "" };
  }
  return { year: year ?? "", month: month ?? "", day: day ?? "" };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
