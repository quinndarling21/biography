"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { CHAPTERS_TEMP } from "@/data/chapters";
import { cn } from "@/lib/utils";

type ChapterProps = (typeof CHAPTERS_TEMP)[number];
type TableOfContentsPanelProps = {
  className?: string;
};

const entryDotColors: Record<string, string> = {
  milestone: "bg-[color:var(--color-accent-primary)]",
  memory: "bg-[color:var(--color-text-secondary)]",
  story: "bg-[color:var(--color-text-strong)]",
};
const chapterPaneHeightClass =
  "max-h-[calc(100vh-140px)] min-h-[360px]";
const timelineButtonHeight = 40;
const timelineConnectorHeight = 24;
const timelineStep = timelineButtonHeight + timelineConnectorHeight;

export function TableOfContentsPanel({ className }: TableOfContentsPanelProps) {
  const defaultChapterId = CHAPTERS_TEMP[0]?.id;
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(defaultChapterId ? [defaultChapterId] : []),
  );
  const [activeChapterId, setActiveChapterId] = useState<string | undefined>(
    defaultChapterId,
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTimelineChapterRef = useRef<string | null>(null);

  const registerChapterRef = useCallback(
    (chapterId: string) => (node: HTMLDivElement | null) => {
      chapterRefs.current[chapterId] = node;
    },
    [],
  );

  const handleToggleChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const syncTimelineToChapter = (
    chapterId: string,
    behavior: ScrollBehavior = "auto",
  ) => {
    const container = timelineScrollRef.current;
    if (!container) return;
    const index = CHAPTERS_TEMP.findIndex((chapter) => chapter.id === chapterId);
    if (index === -1) return;
    const containerHeight = container.clientHeight;
    const maxScroll = container.scrollHeight - containerHeight;
    const ideal =
      index * timelineStep - containerHeight / 2 + timelineStep / 2;
    const target = Math.min(Math.max(ideal, 0), maxScroll);
    container.scrollTo({ top: target, behavior });
  };

  const jumpToChapter = (chapterId: string) => {
    pendingTimelineChapterRef.current = chapterId;
    setActiveChapterId(chapterId);
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.add(chapterId);
      return next;
    });
    setActiveChapterId(chapterId);
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
          setActiveChapterId(closestId);
          syncTimelineToChapter(closestId, "smooth");
        }
        return;
      }

      if (closestId !== activeChapterId) {
        setActiveChapterId(closestId);
        syncTimelineToChapter(closestId);
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeChapterId]);

  return (
    <section
      aria-label="Table of contents"
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-white",
        className,
      )}
    >
      <header className="border-b border-[color:var(--color-border-subtle)] p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[color:var(--color-text-secondary)]">
          Table of Contents
        </p>
      </header>
      <div className="flex flex-1 overflow-hidden p-8">
        <div
          ref={scrollContainerRef}
          className={cn(
            "hide-scrollbar flex w-full gap-4 overflow-y-auto pr-4",
            chapterPaneHeightClass,
          )}
        >
          <div className="flex-1 space-y-4">
            {CHAPTERS_TEMP.map((chapter) => (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                isActive={chapter.id === activeChapterId}
                isExpanded={expandedChapters.has(chapter.id)}
                onToggle={() => handleToggleChapter(chapter.id)}
                innerRef={registerChapterRef(chapter.id)}
              />
            ))}
          </div>
        </div>
        <aside
          className={cn(
            "relative hidden w-16 shrink-0 lg:flex",
            chapterPaneHeightClass,
          )}
        >
          <div className="absolute inset-x-1/2 top-8 bottom-8 -translate-x-1/2 w-px bg-[color:var(--color-border-subtle)]" />
          <div
            ref={timelineScrollRef}
            className="hide-scrollbar relative mx-auto flex w-full flex-col items-center overflow-y-auto py-2"
          >
            {CHAPTERS_TEMP.map((chapter, index) => (
              <div key={chapter.id} className="flex flex-col items-center">
                {index !== 0 ? (
                  <div
                    className="w-px bg-[color:var(--color-border-subtle)]"
                    style={{ height: `${timelineConnectorHeight}px` }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => jumpToChapter(chapter.id)}
                  aria-label={`Jump to chapter ${chapter.number}`}
                  className={cn(
                    "flex items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    chapter.id === activeChapterId
                      ? "border-[color:var(--color-text-strong)] bg-[color:var(--color-accent-highlight)] text-[color:var(--color-text-strong)]"
                      : "border-transparent bg-white text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-border-subtle)]",
                  )}
                  style={{
                    width: `${timelineButtonHeight}px`,
                    height: `${timelineButtonHeight}px`,
                  }}
                >
                  {index + 1}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

type ChapterCardProps = {
  chapter: ChapterProps;
  isActive?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  innerRef: (node: HTMLDivElement | null) => void;
};

function ChapterCard({
  chapter,
  isActive,
  isExpanded,
  onToggle,
  innerRef,
}: ChapterCardProps) {
  return (
    <article
      className={cn(
        "rounded-3xl border px-5 py-4 shadow-sm transition-colors",
        isActive
          ? "border-[color:var(--color-text-strong)] bg-[color:var(--color-accent-highlight)]/40"
          : "border-[color:var(--color-border-subtle)] bg-white",
      )}
      ref={innerRef}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 text-left"
        aria-expanded={isExpanded}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--color-text-secondary)]">
            Chapter {chapter.number}
          </p>
          <p className="text-lg font-semibold text-[color:var(--color-text-strong)]">
            {chapter.title}
          </p>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            {chapter.period}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "ml-auto mt-1 h-5 w-5 text-[color:var(--color-text-secondary)] transition-transform",
            isExpanded ? "rotate-0" : "-rotate-90",
          )}
          aria-hidden
        />
      </button>
      <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]/90">
        {chapter.summary}
      </p>
      {isExpanded ? (
        <ul className="mt-4 space-y-3 border-l border-[color:var(--color-border-subtle)] pl-4">
          {chapter.entries.map((entry) => (
            <li key={entry.id}>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1 h-2.5 w-2.5 rounded-full",
                    entryDotColors[entry.type],
                  )}
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-[color:var(--color-text-strong)]">
                    {entry.title}
                  </p>
                  <p className="text-xs text-[color:var(--color-text-muted)]">
                    {entry.dateLabel}
                  </p>
                  <p className="text-xs text-[color:var(--color-text-secondary)]/80">
                    {entry.summary}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
