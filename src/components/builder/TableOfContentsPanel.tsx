"use client";

import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";

import { ChapterFormDialog } from "@/components/builder/dialogs/ChapterFormDialog";
import { ManualEntryDialog } from "@/components/builder/dialogs/ManualEntryDialog";
import { useTimeline } from "@/components/providers/TimelineProvider";
import { Button } from "@/components/ui/Button";
import type { Chapter, ChapterEntry as ChapterEntryView, EntryType } from "@/data/chapters";
import {
  chapterEntryToManualRecord,
  chapterToDraft,
  type ChapterDraft,
  type ManualEntryRecord,
} from "@/data/manual-entries";
import type { ChapterEntry, UserChapter } from "@/lib/services/biography-data-service";
import { cn } from "@/lib/utils";

type TableOfContentsPanelProps = {
  className?: string;
};

const entryDotColors: Record<EntryType, string> = {
  milestone: "bg-[var(--color-accent-primary)]",
  memory: "bg-[var(--color-text-secondary)]",
  story: "bg-[var(--color-text-strong)]",
};
const chapterPaneHeightClass =
  "max-h-[calc(100vh-140px)] min-h-[360px]";
const timelineButtonHeight = 40;
const timelineConnectorHeight = 24;
const timelineStep = timelineButtonHeight + timelineConnectorHeight;
const EMPTY_CHAPTER_DRAFT: ChapterDraft = {
  title: "",
  description: "",
};
const END_DROP_ZONE_ID = "__chapter-dropzone-end__";

export function TableOfContentsPanel({ className }: TableOfContentsPanelProps) {
  const {
    chapters,
    userChapters,
    timeline,
    mutating,
    createChapter,
    updateChapter,
    deleteChapter,
    reorderChapters,
    updateManualEntry,
    archiveManualEntry,
  } = useTimeline();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => (chapters[0] ? new Set([chapters[0].id]) : new Set()),
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(
    () => chapters[0]?.id,
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimelineChapterRef = useRef<string | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [chapterDialog, setChapterDialog] = useState<{
    mode: "create" | "edit";
    chapter?: UserChapter;
  } | null>(null);
  const [entryDialogId, setEntryDialogId] = useState<string | null>(null);
  const [reorderedChapters, setReorderedChapters] = useState<Chapter[] | null>(null);
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const dropHandledRef = useRef(false);
  const closeChapterDialog = () => setChapterDialog(null);
  const closeEntryDialog = () => setEntryDialogId(null);

  const orderedChapters = reorderedChapters ?? chapters;
  const canReorderChapters = orderedChapters.length > 1 && !mutating;

  const handleDragStart = useCallback(
    (chapterId: string) => {
      if (!canReorderChapters) {
        return;
      }
      dropHandledRef.current = false;
      setDraggingChapterId(chapterId);
      setReorderedChapters(orderedChapters.slice());
    },
    [canReorderChapters, orderedChapters],
  );

  const handleDragEnter = useCallback(
    (targetId: string) => {
      if (!draggingChapterId || !canReorderChapters) {
        return;
      }
      setReorderedChapters((current) => {
        const baseline = current ?? orderedChapters.slice();
        const sourceIndex = baseline.findIndex((chapter) => chapter.id === draggingChapterId);
        if (sourceIndex === -1) {
          return baseline;
        }
        if (targetId === END_DROP_ZONE_ID) {
          if (sourceIndex === baseline.length - 1) {
            return baseline;
          }
          const next = [...baseline];
          const [moved] = next.splice(sourceIndex, 1);
          next.push(moved);
          return next;
        }
        const targetIndex = baseline.findIndex((chapter) => chapter.id === targetId);
        if (targetIndex === -1 || targetIndex === sourceIndex) {
          return baseline;
        }
        const next = [...baseline];
        const [moved] = next.splice(sourceIndex, 1);
        const insertionIndex = next.findIndex((chapter) => chapter.id === targetId);
        next.splice(insertionIndex, 0, moved);
        return next;
      });
    },
    [canReorderChapters, draggingChapterId, orderedChapters],
  );

  const handleDrop = useCallback(
    async (event?: DragEvent) => {
      event?.preventDefault();
      event?.stopPropagation();
      if (!draggingChapterId || !reorderedChapters) {
        return;
      }
      dropHandledRef.current = true;
      const hasChanges =
        reorderedChapters.length !== chapters.length ||
        reorderedChapters.some((chapter, index) => chapter.id !== chapters[index]?.id);
      const orderedIds = reorderedChapters.map((chapter) => chapter.id);
      setDraggingChapterId(null);
      if (hasChanges) {
        const result = await reorderChapters(orderedIds);
        if (result.error) {
          console.error("Failed to reorder chapters", result.error);
        }
      }
      setReorderedChapters(null);
    },
    [chapters, draggingChapterId, reorderChapters, reorderedChapters],
  );

  const handleDragEndEvent = useCallback(() => {
    if (dropHandledRef.current) {
      dropHandledRef.current = false;
      return;
    }
    setDraggingChapterId(null);
    setReorderedChapters(null);
  }, []);

  const entryMap = useMemo(() => {
    const map = new Map<string, ChapterEntry>();
    timeline.forEach(({ entries }) => {
      entries.forEach((entry) => {
        map.set(entry.id, entry);
      });
    });
    return map;
  }, [timeline]);

  const userChapterMap = useMemo(
    () => new Map(userChapters.map((chapter) => [chapter.id, chapter])),
    [userChapters],
  );

  const safeEntryId =
    entryDialogId && entryMap.has(entryDialogId) ? entryDialogId : null;
  const editingEntry = safeEntryId ? entryMap.get(safeEntryId) : null;
  const editingEntryRecord: ManualEntryRecord | null = editingEntry
    ? chapterEntryToManualRecord(editingEntry)
    : null;

  const chapterFormDraft = chapterDialog?.chapter
    ? chapterToDraft(chapterDialog.chapter)
    : EMPTY_CHAPTER_DRAFT;

  const expandedChapterIds = useMemo(() => {
    const availableIds = new Set(orderedChapters.map((chapter) => chapter.id));
    const normalized = new Set<string>();
    expandedChapters.forEach((id) => {
      if (availableIds.has(id)) {
        normalized.add(id);
      }
    });
    return normalized;
  }, [expandedChapters, orderedChapters]);

  const activeChapterId = useMemo(() => {
    if (
      selectedChapterId &&
      orderedChapters.some((chapter) => chapter.id === selectedChapterId)
    ) {
      return selectedChapterId;
    }
    return undefined;
  }, [selectedChapterId, orderedChapters]);

  const registerChapterRef = useCallback(
    (chapterId: string) => (node: HTMLDivElement | null) => {
      chapterRefs.current[chapterId] = node;
    },
    [],
  );

  const toggleEntryDetails = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const handleToggleChapter = useCallback(
    (chapter: Chapter) => {
      const nextExpanded = new Set(expandedChapterIds);
      const isClosing = nextExpanded.has(chapter.id);
      if (isClosing) {
        nextExpanded.delete(chapter.id);
        setExpandedEntries((prevEntries) => {
          if (!prevEntries.size) {
            return prevEntries;
          }
          const nextEntries = new Set(prevEntries);
          chapter.entries.forEach((entry) => nextEntries.delete(entry.id));
          if (nextEntries.size === prevEntries.size) {
            return prevEntries;
          }
          return nextEntries;
        });
        setSelectedChapterId((current) => {
          if (current && current !== chapter.id && nextExpanded.has(current)) {
            return current;
          }
          const fallback = nextExpanded.values().next().value as string | undefined;
          return fallback;
        });
      } else {
        nextExpanded.add(chapter.id);
        setSelectedChapterId(chapter.id);
      }
      setExpandedChapters(nextExpanded);
    },
    [expandedChapterIds],
  );

  const syncTimelineToChapter = useCallback(
    (chapterId: string, behavior: ScrollBehavior = "auto") => {
      const container = timelineScrollRef.current;
      if (!container) return;
      const index = orderedChapters.findIndex((chapter) => chapter.id === chapterId);
      if (index === -1) return;
      const containerHeight = container.clientHeight;
      const maxScroll = container.scrollHeight - containerHeight;
      const ideal =
        index * timelineStep - containerHeight / 2 + timelineStep / 2;
      const target = Math.min(Math.max(ideal, 0), maxScroll);
      container.scrollTo({ top: target, behavior });
    },
    [orderedChapters],
  );

  const jumpToChapter = (chapterId: string) => {
    pendingTimelineChapterRef.current = chapterId;
    setSelectedChapterId(chapterId);
    const next = new Set(expandedChapterIds);
    next.add(chapterId);
    setExpandedChapters(next);
    const node = chapterRefs.current[chapterId];
    const container = scrollContainerRef.current;
    if (node && container) {
      const nodeRect = node.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = Math.max(
        container.scrollTop + (nodeRect.top - containerRect.top) - 8,
        0,
      );
      container.scrollTo({
        top: offsetTop,
        behavior: "smooth",
      });
    }
  };

  const openChapterDialog = (mode: "create" | "edit", chapter?: UserChapter) => {
    setChapterDialog({ mode, chapter });
  };

  const handleDialogDeleteChapter = async (chapter: UserChapter) => {
    const result = await deleteChapter(chapter.id);
    if (!result.error) {
      closeChapterDialog();
    }
    return result;
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      const entries = Object.entries(chapterRefs.current);
      if (!entries.length) return;
      const containerRect = container.getBoundingClientRect();
      let closestId = activeChapterId;
      for (const [id, node] of entries) {
        if (!node) continue;
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.top <= containerRect.top + 16) {
          closestId = id;
        }
      }
      if (!closestId) {
        return;
      }

      if (pendingTimelineChapterRef.current) {
        if (closestId === pendingTimelineChapterRef.current) {
          pendingTimelineChapterRef.current = null;
          setSelectedChapterId(closestId);
          syncTimelineToChapter(closestId, "smooth");
        }
        return;
      }

      if (closestId !== activeChapterId) {
        setSelectedChapterId(closestId);
        syncTimelineToChapter(closestId);
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeChapterId, orderedChapters.length, syncTimelineToChapter]);

  return (
    <>
      <section
      aria-label="Table of contents"
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-white",
        className,
      )}
    >
      <header className="border-b border-[var(--color-border-subtle)] p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            Table of Contents
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() =>
              setChapterDialog({
                mode: "create",
              })
            }
            disabled={mutating}
            className="text-xs uppercase tracking-wide"
          >
            Add chapter
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden p-8">
        <div
          ref={scrollContainerRef}
          className={cn(
            "hide-scrollbar flex w-full gap-4 overflow-y-auto pr-4",
            chapterPaneHeightClass,
          )}
        >
          <div
            className="flex-1 space-y-4"
            onDragOver={(event) => {
              if (!draggingChapterId) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!draggingChapterId) return;
              void handleDrop(event);
            }}
          >
            {orderedChapters.length === 0 ? (
              <EmptyChaptersState
                onAddChapter={() => openChapterDialog("create")}
                disabled={mutating}
              />
            ) : (
              orderedChapters.map((chapter, index) => {
                const chapterRecord = userChapterMap.get(chapter.id) ?? null;
                return (
                  <ChapterCard
                    key={chapter.id}
                    chapter={chapter}
                    userChapter={chapterRecord}
                    isActive={chapter.id === activeChapterId}
                    isExpanded={expandedChapterIds.has(chapter.id)}
                    displayIndex={index}
                    expandedEntries={expandedEntries}
                    onToggle={() => handleToggleChapter(chapter)}
                    onToggleEntry={toggleEntryDetails}
                    onEditEntry={setEntryDialogId}
                    onEditChapter={
                      chapterRecord
                        ? () => openChapterDialog("edit", chapterRecord)
                        : undefined
                    }
                    innerRef={registerChapterRef(chapter.id)}
                    draggable={canReorderChapters}
                    dragging={Boolean(draggingChapterId)}
                    isDragging={draggingChapterId === chapter.id}
                    onDragStart={() => handleDragStart(chapter.id)}
                    onDragEnter={() => handleDragEnter(chapter.id)}
                    onDrop={(event) => {
                      void handleDrop(event);
                    }}
                    onDragEnd={handleDragEndEvent}
                  />
                );
              })
            )}
            {draggingChapterId ? (
              <div
                className="mt-2 flex h-12 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-subtle)]/80 bg-[var(--color-accent-highlight)]/20 text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]"
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => handleDragEnter(END_DROP_ZONE_ID)}
                onDrop={(event) => {
                  void handleDrop(event);
                }}
              >
                Drop to move to end
              </div>
            ) : null}
          </div>
        </div>
        <aside
          className={cn(
            "relative hidden w-16 shrink-0 lg:flex",
            chapterPaneHeightClass,
          )}
        >
          <div className="absolute inset-x-1/2 top-8 bottom-8 -translate-x-1/2 w-px bg-[var(--color-border-subtle)]" />
          <div
            ref={timelineScrollRef}
            className="hide-scrollbar relative mx-auto flex w-full flex-col items-center overflow-y-auto py-2"
          >
            {orderedChapters.length === 0 ? (
              <div className="text-center text-xs text-[var(--color-text-muted)]">
                --
              </div>
            ) : (
              orderedChapters.map((chapter, index) => (
                <div key={chapter.id} className="flex flex-col items-center">
                  {index !== 0 ? (
                    <div
                      className="w-px bg-[var(--color-border-subtle)]"
                      style={{ height: `${timelineConnectorHeight}px` }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => jumpToChapter(chapter.id)}
                    aria-label={`Jump to chapter ${index + 1}`}
                    className={cn(
                      "flex items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                      chapter.id === activeChapterId
                        ? "border-[var(--color-text-strong)] bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]"
                        : "border-transparent bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-subtle)]",
                    )}
                    style={{
                      width: `${timelineButtonHeight}px`,
                      height: `${timelineButtonHeight}px`,
                    }}
                  >
                    {index + 1}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
      </section>
      {chapterDialog ? (
        <ChapterFormDialog
          key={chapterDialog.chapter?.id ?? "create"}
          open
          mode={chapterDialog.mode}
          initialDraft={chapterFormDraft}
          submitting={mutating}
          onClose={closeChapterDialog}
          onSubmit={(draft) =>
            chapterDialog.mode === "edit" && chapterDialog.chapter
              ? updateChapter(chapterDialog.chapter.id, draft)
              : createChapter(draft)
          }
          onDelete={
            chapterDialog.mode === "edit" && chapterDialog.chapter
              ? () => handleDialogDeleteChapter(chapterDialog.chapter!)
              : undefined
          }
        />
      ) : null}
      {editingEntryRecord ? (
        <ManualEntryDialog
          key={editingEntryRecord.id}
          open
          mode="edit"
          initialEntry={editingEntryRecord}
          chapters={userChapters}
          submitting={mutating}
          onClose={closeEntryDialog}
          onSubmit={(draft) => updateManualEntry(editingEntryRecord.id, draft)}
          onArchive={() => archiveManualEntry(editingEntryRecord.id)}
        />
      ) : null}
    </>
  );
}

type ChapterCardProps = {
  chapter: Chapter;
  userChapter: UserChapter | null;
  isActive?: boolean;
  isExpanded: boolean;
  displayIndex: number;
  expandedEntries: Set<string>;
  onToggle: () => void;
  onToggleEntry: (entryId: string) => void;
  onEditEntry: (entryId: string) => void;
  onEditChapter?: () => void;
  innerRef: (node: HTMLDivElement | null) => void;
  draggable?: boolean;
  dragging?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragEnd?: () => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
};

function ChapterCard({
  chapter,
  userChapter,
  isActive,
  isExpanded,
  displayIndex,
  expandedEntries,
  onToggle,
  onToggleEntry,
  onEditEntry,
  onEditChapter,
  innerRef,
  draggable,
  dragging,
  isDragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: ChapterCardProps) {
  return (
    <article
      className={cn(
        "rounded-3xl border px-5 py-4 shadow-sm transition-colors",
        isActive
          ? "border-[var(--color-text-strong)] bg-[var(--color-accent-highlight)]/40"
          : "border-[var(--color-border-subtle)] bg-white",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-70" : "",
      )}
      ref={innerRef}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnter={(event) => {
        if (!draggable || !dragging) return;
        event.preventDefault();
        event.stopPropagation();
        onDragEnter?.();
      }}
      onDragOver={(event) => {
        if (!draggable || !dragging) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop?.(event);
      }}
      onDragEnd={(event) => {
        if (!draggable) return;
        event.stopPropagation();
        onDragEnd?.();
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex w-full items-start gap-3">
          <span
            className={cn(
              "mt-1 hidden text-[var(--color-text-muted)] transition-opacity sm:inline-block",
              draggable ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <div className="space-y-1 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
              Chapter {displayIndex + 1}
            </p>
            <p className="text-lg font-semibold text-[var(--color-text-strong)]">
              {chapter.title}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 text-[var(--color-text-secondary)] transition-transform",
              isExpanded ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
        </div>
      </button>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]/90">
        {chapter.summary}
      </p>
      {isExpanded && onEditChapter && userChapter ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs font-semibold text-[var(--color-text-secondary)] underline-offset-4 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onEditChapter();
            }}
          >
            Edit chapter
          </button>
        </div>
      ) : null}
      {isExpanded && chapter.entries.length ? (
        <ul className="mt-4 space-y-3 border-l border-[var(--color-border-subtle)] pl-4">
          {chapter.entries.map((entry) => (
            <ChapterEntryRow
              key={entry.id}
              entry={entry}
              isExpanded={expandedEntries.has(entry.id)}
              onToggle={() => onToggleEntry(entry.id)}
              onEdit={() => onEditEntry(entry.id)}
            />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

type ChapterEntryRowProps = {
  entry: ChapterEntryView;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
};

function ChapterEntryRow({
  entry,
  isExpanded,
  onToggle,
  onEdit,
}: ChapterEntryRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          className={cn(
            "mt-2 h-2.5 w-2.5 rounded-full",
            entryDotColors[entry.type],
          )}
          aria-hidden
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--color-text-strong)]">
              {entry.title}
            </p>
            {entry.status !== "published" ? (
              <span className="rounded-full bg-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {statusLabel(entry.status)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {entry.dateLabel}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]/80">
            {entry.summary}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "ml-2 mt-2 h-4 w-4 text-[var(--color-text-secondary)] transition-transform",
            isExpanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {isExpanded ? (
        <>
          <div className="mt-2 ml-5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="text-xs font-semibold text-[var(--color-text-strong)] underline-offset-4 hover:underline"
            >
              Edit entry
            </button>
          </div>
          <div className="mt-3 ml-5 rounded-2xl bg-[var(--color-accent-highlight)]/30 p-3 text-sm text-[var(--color-text-secondary)]">
            {entry.details ? (
              <p className="whitespace-pre-line text-[var(--color-text-secondary)]/90">
                {entry.details}
              </p>
            ) : (
              <p className="text-[var(--color-text-secondary)]/70">No additional details yet.</p>
            )}
          </div>
        </>
      ) : null}
    </li>
  );
}

function statusLabel(status: ChapterEntryView["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
    default:
      return "Published";
  }
}

function EmptyChaptersState({
  onAddChapter,
  disabled,
}: {
  onAddChapter: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--color-border-subtle)] bg-white/60 p-6 text-center">
      <p className="text-base font-semibold text-[var(--color-text-strong)]">
        No chapters yet
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Start by adding a chapter to begin your timeline.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="mt-4"
        onClick={onAddChapter}
        disabled={disabled}
      >
        Add chapter
      </Button>
    </div>
  );
}
