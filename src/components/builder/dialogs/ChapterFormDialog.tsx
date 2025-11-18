import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { ChapterDraft } from "@/data/manual-entries";
import type { ServiceResult } from "@/lib/services/biography-data-service";

import { DialogShell } from "./DialogShell";

type ChapterFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialDraft: ChapterDraft;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: ChapterDraft) => Promise<ServiceResult<unknown>>;
  onDelete?: () => Promise<ServiceResult<unknown>>;
};

type ChapterFormState = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

export function ChapterFormDialog({
  open,
  mode,
  initialDraft,
  submitting,
  onClose,
  onSubmit,
  onDelete,
}: ChapterFormDialogProps) {
  const [form, setForm] = useState<ChapterFormState>(() =>
    buildChapterFormState(initialDraft),
  );
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const result = await onSubmit({
      title: form.title,
      description: form.description || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onClose();
  };

  return (
    <DialogShell
      open={open}
      title={mode === "edit" ? "Update chapter" : "Create chapter"}
      description={
        mode === "edit"
          ? "Adjust the dates, title, or description for this era."
          : "Define a timeframe and summary for your next chapter."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          Description
          <textarea
            className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
            rows={3}
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
            Start date
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
              value={form.startDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, startDate: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
            End date
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
              value={form.endDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, endDate: event.target.value }))
              }
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Delete this chapter? Entries will also be removed.")) {
                  return;
                }
                const result = await onDelete();
                if (result.error) {
                  setError(result.error.message);
                }
              }}
              className="text-sm font-semibold text-red-600 underline-offset-4 hover:underline"
            >
              Delete chapter
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              className="text-sm"
            >
              Cancel
            </Button>
            <Button type="submit" size="md" disabled={submitting}>
              {mode === "edit" ? "Save changes" : "Create chapter"}
            </Button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

function buildChapterFormState(draft: ChapterDraft): ChapterFormState {
  return {
    title: draft.title,
    description: draft.description ?? "",
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
  };
}
