"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Loader2, Plus, RotateCcw, Send, Lock } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { ManualEntryDialog } from "@/components/builder/dialogs/ManualEntryDialog";
import {
  InterviewService,
  type InterviewDebugLog,
  type InterviewEntryRecord,
  type InterviewMessage,
  type UserInterview,
} from "@/lib/services/interview-service";
import {
  formatAbsoluteDate,
  formatInterviewTitle,
} from "@/lib/interviews/utils";
import { formatEntryDateLabel } from "@/lib/timeline/transformers";
import { cn } from "@/lib/utils";
import { BiographyDataService } from "@/lib/services/biography-data-service";
import type { UserChapter } from "@/lib/services/biography-data-service";
import {
  chapterEntryToManualRecord,
  manualEntryDraftToUpdate,
} from "@/data/manual-entries";
import type { Json } from "@/lib/supabase/types";

type ConversationMap = Record<string, InterviewMessage[]>;
type EntryMap = Record<string, InterviewEntryRecord[]>;
type DebugLogMap = Record<string, InterviewDebugLog[]>;
type ChapterEntry = NonNullable<InterviewEntryRecord["chapter_entries"]>;

type InterviewerScreenProps = {
  initialInterviews: UserInterview[];
  initialMessages: InterviewMessage[];
  initialEntries: InterviewEntryRecord[];
  initialInterviewId: string | null;
  initialChapters: UserChapter[];
  isAdmin: boolean;
  initialDebugLogs?: InterviewDebugLog[];
};

export function InterviewerScreen({
  initialInterviews,
  initialMessages,
  initialEntries,
  initialInterviewId,
  initialChapters,
  isAdmin,
  initialDebugLogs = [],
}: InterviewerScreenProps) {
  const supabase = useSupabase();
  const interviewService = useMemo(
    () => new InterviewService(supabase),
    [supabase],
  );
  const dataService = useMemo(
    () => new BiographyDataService(supabase),
    [supabase],
  );

  const [interviews, setInterviews] = useState<UserInterview[]>(initialInterviews);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(
    initialInterviewId,
  );
  const [messagesByInterview, setMessagesByInterview] = useState<ConversationMap>(
    () => (initialInterviewId ? { [initialInterviewId]: initialMessages } : {}),
  );
  const [entriesByInterview, setEntriesByInterview] = useState<EntryMap>(
    () => (initialInterviewId ? { [initialInterviewId]: initialEntries } : {}),
  );
  const [debugLogsByInterview, setDebugLogsByInterview] = useState<DebugLogMap>(
    () =>
      initialInterviewId && isAdmin && initialDebugLogs.length
        ? { [initialInterviewId]: initialDebugLogs }
        : {},
  );
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [chapters] = useState<UserChapter[]>(initialChapters);
  const [entryDialogTarget, setEntryDialogTarget] = useState<
    | { entry: ChapterEntry; interviewId: string }
    | null
  >(null);
  const [entryDialogSubmitting, setEntryDialogSubmitting] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const activeMessages = activeInterviewId
    ? messagesByInterview[activeInterviewId]
    : undefined;
  const activeEntries = activeInterviewId
    ? entriesByInterview[activeInterviewId]
    : undefined;
  const activeInterview = activeInterviewId
    ? interviews.find((interview) => interview.id === activeInterviewId) ?? null
    : null;
  const activeDebugLogs =
    isAdmin && activeInterviewId ? debugLogsByInterview[activeInterviewId] : undefined;
  const activeDebugLogMap = useMemo(() => {
    if (!activeDebugLogs || activeDebugLogs.length === 0) {
      return {};
    }
    return activeDebugLogs.reduce<Record<string, InterviewDebugLog>>((acc, log) => {
      acc[log.interview_message_id] = log;
      return acc;
    }, {});
  }, [activeDebugLogs]);

  const canChat = Boolean(activeInterview && activeInterview.status === "in_progress");

  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = messageViewportRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages, activeInterviewId]);

  const cacheConversation = useCallback(
    (interviewId: string, payload: ConversationMap[string]) => {
      setMessagesByInterview((prev) => ({
        ...prev,
        [interviewId]: payload,
      }));
    },
    [],
  );

  const cacheEntries = useCallback(
    (interviewId: string, payload: EntryMap[string]) => {
      setEntriesByInterview((prev) => ({
        ...prev,
        [interviewId]: payload,
      }));
    },
    [],
  );
  const cacheDebugLogs = useCallback(
    (interviewId: string, payload: DebugLogMap[string]) => {
      setDebugLogsByInterview((prev) => ({
        ...prev,
        [interviewId]: payload,
      }));
    },
    [],
  );

  const loadConversation = useCallback(
    async (interviewId: string) => {
      setLoadingConversation(true);
      const debugPromise = isAdmin
        ? interviewService.getDebugLogs(interviewId)
        : Promise.resolve(null);
      const [messagesResult, entriesResult, debugResult] = await Promise.all([
        interviewService.getMessages(interviewId),
        interviewService.getEntries(interviewId),
        debugPromise,
      ]);

      if (messagesResult.error) {
        setError(messagesResult.error.message);
      } else {
        cacheConversation(interviewId, messagesResult.data);
      }

      if (entriesResult.error) {
        setError(entriesResult.error.message);
      } else {
        cacheEntries(interviewId, entriesResult.data);
      }

      if (isAdmin && debugResult) {
        if (debugResult.error) {
          setError(debugResult.error.message);
        } else {
          cacheDebugLogs(interviewId, debugResult.data);
        }
      }

      setLoadingConversation(false);
    },
    [cacheConversation, cacheEntries, cacheDebugLogs, interviewService, isAdmin],
  );

  const refreshEntries = useCallback(
    async (interviewId: string) => {
      const { data, error: refreshError } = await interviewService.getEntries(
        interviewId,
      );
      if (refreshError) {
        setError(refreshError.message);
        return;
      }
      cacheEntries(interviewId, data);
    },
    [cacheEntries, interviewService],
  );

  const refreshDebugLogs = useCallback(
    async (interviewId: string) => {
      if (!isAdmin) {
        return;
      }
      const { data, error: debugError } = await interviewService.getDebugLogs(
        interviewId,
      );
      if (debugError) {
        setError(debugError.message);
        return;
      }
      cacheDebugLogs(interviewId, data);
    },
    [cacheDebugLogs, interviewService, isAdmin],
  );

  const handleSelectInterview = useCallback(
    async (interviewId: string) => {
      setError(null);
      setActiveInterviewId(interviewId);
      if (!messagesByInterview[interviewId]) {
        await loadConversation(interviewId);
      }
    },
    [loadConversation, messagesByInterview],
  );

  const handleStartInterview = useCallback(async () => {
    if (creating) return;
    setError(null);
    setCreating(true);
    const result = await interviewService.createInterview();
    if (result.error) {
      setError(result.error.message);
      setCreating(false);
      return;
    }
    const { interview, openingMessage } = result.data;
    setInterviews((prev) => [interview, ...prev]);
    setActiveInterviewId(interview.id);
    cacheConversation(interview.id, [openingMessage]);
    setCreating(false);
  }, [cacheConversation, creating, interviewService]);

  const handleSend = useCallback(async () => {
    if (!activeInterviewId || !message.trim() || sending || !canChat) {
      return;
    }
    const payload = message.trim();
    setMessage("");
    setSending(true);
    setError(null);

    const result = await interviewService.sendUserMessage({
      interviewId: activeInterviewId,
      body: payload,
    });

    if (result.error) {
      setError(result.error.message);
      setMessage(payload);
      setSending(false);
      return;
    }

    cacheConversation(activeInterviewId, [
      ...(messagesByInterview[activeInterviewId] ?? []),
      result.data.userMessage,
      result.data.interviewerMessage,
    ]);

    if (
      (result.data.createdEntryIds && result.data.createdEntryIds.length > 0) ||
      (result.data.updatedEntryIds && result.data.updatedEntryIds.length > 0)
    ) {
      await refreshEntries(activeInterviewId);
    }

    if (isAdmin) {
      await refreshDebugLogs(activeInterviewId);
    }

    setSending(false);
  }, [
    activeInterviewId,
    cacheConversation,
    canChat,
    interviewService,
    isAdmin,
    message,
    messagesByInterview,
    refreshDebugLogs,
    refreshEntries,
    sending,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleSend();
    },
    [handleSend],
  );

  const handleReopenInterview = useCallback(async () => {
    if (!activeInterviewId || reopening) {
      return;
    }
    setError(null);
    setReopening(true);
    const result = await interviewService.reopenInterview(activeInterviewId);
    if (result.error) {
      setError(result.error.message);
      setReopening(false);
      return;
    }
    setInterviews((prev) =>
      prev.map((interview) =>
        interview.id === result.data.id ? result.data : interview,
      ),
    );
    setReopening(false);
  }, [activeInterviewId, interviewService, reopening]);

  const messagePlaceholder = activeInterview
    ? canChat
      ? 'Share your next thought or type "add new entry" to capture it.'
      : "Reopen this chat to keep capturing your story."
    : "Select a conversation to begin chatting.";

  const entries: ChapterEntry[] = (activeEntries ?? [])
    .map((record) => record.chapter_entries)
    .filter((entry): entry is ChapterEntry => Boolean(entry));

  const activeEntryRecord = useMemo(
    () =>
      entryDialogTarget ? chapterEntryToManualRecord(entryDialogTarget.entry) : null,
    [entryDialogTarget],
  );

  return (
    <div className="grid min-h-[calc(100vh-140px)] grid-cols-1 gap-4 bg-[var(--color-surface-base)] p-4 text-[var(--color-text-strong)] lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
              Conversations
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Pick up where you left off.
            </p>
          </div>
          <button
            type="button"
            aria-label="Start new conversation"
            disabled={creating}
            onClick={() => {
              void handleStartInterview();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-subtle)] bg-white text-[var(--color-text-strong)] shadow-sm transition hover:border-[var(--color-text-strong)] disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {interviews.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-text-muted)]">
            Start your first chat-based interview to see it listed here.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {interviews.map((interview, index) => {
              const isActive = interview.id === activeInterviewId;
              return (
                <li key={interview.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSelectInterview(interview.id);
                    }}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      isActive
                        ? "border-[var(--color-text-strong)] bg-[var(--color-accent-highlight)]/60"
                        : "border-[var(--color-border-subtle)] bg-white hover:border-[var(--color-text-strong)]",
                    )}
                  >
                    <p className="text-sm font-semibold">
                      {formatInterviewTitle(interview, index + 1)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Started {formatAbsoluteDate(interview.created_at)}
                    </p>
                    <span
                      className={cn(
                        "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        interview.status === "in_progress"
                          ? "bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]"
                          : "bg-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
                      )}
                    >
                      {interview.status === "in_progress" ? "In progress" : "Closed"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="flex min-h-[400px] flex-col rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <header className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">
              {activeInterview ? formatInterviewTitle(activeInterview) : "Select a conversation"}
            </p>
            {activeInterview ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {activeInterview.status === "in_progress" ? "In progress" : "Closed"} • Started {formatAbsoluteDate(activeInterview.created_at)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowDebug((prev) => !prev)}
                className={cn(
                  "inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold transition",
                  showDebug
                    ? "border-[var(--color-text-strong)] bg-[var(--color-text-strong)] text-on-strong"
                    : "border-[var(--color-border-subtle)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-text-strong)] hover:text-[var(--color-text-strong)]",
                )}
              >
                <Bug className="h-4 w-4" aria-hidden />
                <span className="ml-2">{showDebug ? "Hide debug" : "Debug mode"}</span>
              </button>
            ) : null}
            {canChat ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={closing}
                onClick={async () => {
                  if (!activeInterviewId) return;
                  setError(null);
                  setClosing(true);
                  const result = await interviewService.closeInterview(activeInterviewId);
                  if (result.error) {
                    setError(result.error.message);
                    setClosing(false);
                    return;
                  }
                  setInterviews((prev) =>
                    prev.map((interview) =>
                      interview.id === result.data.id ? result.data : interview,
                    ),
                  );
                  setClosing(false);
                }}
                className="text-xs"
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden />
                )}
                <span className="ml-2">Mark as closed</span>
              </Button>
            ) : null}
          </div>
        </header>
        {error ? (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="flex-1">
          <div
            ref={messageViewportRef}
            className="max-h-[60vh] min-h-[240px] space-y-4 overflow-y-auto rounded-3xl border border-[var(--color-border-subtle)] bg-white/80 p-4"
          >
            {loadingConversation ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading conversation...
              </div>
            ) : !activeInterview ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Select a conversation from the left or start a new chat to begin.
              </p>
            ) : (activeMessages?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                I’ll kick things off once you send your first message.
              </p>
            ) : (
              activeMessages!.map((messageItem) => (
                <MessageBubble
                  key={`${messageItem.id}-${messageItem.sequence}`}
                  message={messageItem}
                  debugEnabled={isAdmin && showDebug}
                  debugLog={activeDebugLogMap[messageItem.id]}
                />
              ))
            )}
          </div>
        </div>
        {canChat ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            <label className="block text-sm font-semibold text-[var(--color-text-secondary)]">
              Your message
            </label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={messagePlaceholder}
              className="min-h-[120px] w-full resize-none rounded-2xl border border-[var(--color-border-subtle)] bg-white/90 p-4 text-sm text-[var(--color-text-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-highlight)]"
            />
            <div className="flex items-center justify-end gap-3">
              <Button
                type="submit"
                size="md"
                disabled={sending || !message.trim()}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                <span className="ml-2">Send</span>
              </Button>
            </div>
          </form>
        ) : activeInterview ? (
          <div className="mt-4 flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/60 p-6 text-center text-sm">
            <p className="text-[var(--color-text-secondary)]">
              This interview is closed. Reopen it to keep capturing your story.
            </p>
            <Button
              type="button"
              size="md"
              disabled={reopening}
              onClick={() => {
                void handleReopenInterview();
              }}
            >
              {reopening ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden />
              )}
              <span className="ml-2">Reopen chat</span>
            </Button>
          </div>
        ) : null}
      </section>
      <aside className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          Entries captured
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Entries created during this chat appear here.
        </p>
        {entries.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">
            {"No entries yet. Type \"add new entry\" while chatting to capture one automatically."}
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {entries.map((entry) => {
              const statusLabel = entry.status === "published" ? "Published" : "Draft";
              const statusStyles = entry.status === "published"
                ? "bg-[var(--color-accent-primary)]/30 text-[var(--color-text-strong)]"
                : "bg-[var(--color-accent-highlight)]/50 text-[var(--color-text-strong)]";
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeInterviewId) return;
                      setEntryDialogTarget({ entry, interviewId: activeInterviewId });
                    }}
                    className="w-full rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/70 p-4 text-left transition hover:border-[var(--color-text-strong)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text-strong)]">
                          {entry.title}
                        </p>
                        {entry.entry_date ? (
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {formatEntryDateLabel(
                              entry.entry_date,
                              entry.date_granularity,
                            )}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          statusStyles,
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {entry.summary ? (
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {entry.summary}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <ManualEntryDialog
        key={activeEntryRecord?.id ?? "interview-entry"}
        open={Boolean(entryDialogTarget && activeEntryRecord)}
        mode="edit"
        initialEntry={activeEntryRecord ?? undefined}
        chapters={chapters}
        submitting={entryDialogSubmitting}
        onClose={() => setEntryDialogTarget(null)}
        onSubmit={async (draft) => {
          if (!entryDialogTarget) {
            return {
              data: null,
              error: {
                context: "update chat entry",
                message: "Select an entry to update.",
              },
            };
          }
          setEntryDialogSubmitting(true);
          const result = await dataService.updateChapterEntry(
            entryDialogTarget.entry.id,
            manualEntryDraftToUpdate(draft),
          );
          setEntryDialogSubmitting(false);
          if (!result.error) {
            await refreshEntries(entryDialogTarget.interviewId);
            setEntryDialogTarget(null);
          }
          return result;
        }}
        entryType={activeEntryRecord?.type}
      />
    </div>
  );
}

function MessageBubble({
  message,
  debugEnabled = false,
  debugLog,
}: {
  message: InterviewMessage;
  debugEnabled?: boolean;
  debugLog?: InterviewDebugLog;
}) {
  const isUser = message.author === "user";
  const showDebug = debugEnabled && !isUser;

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end text-on-strong" : "items-start text-[var(--color-text-strong)]",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser
            ? "bg-[var(--color-text-strong)] text-on-strong"
            : "bg-white text-[var(--color-text-strong)]",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.body}
        </p>
      </div>
      {showDebug ? <DebugPanel log={debugLog ?? null} /> : null}
    </div>
  );
}

function DebugPanel({ log }: { log: InterviewDebugLog | null }) {
  if (!log) {
    return (
      <div className="max-w-[85%] rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-white/80 px-4 py-3 text-xs text-[var(--color-text-secondary)] shadow-sm">
        No debug payload recorded for this reply yet.
      </div>
    );
  }

  return (
    <div className="max-w-[85%] space-y-3 rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/80 p-4 text-[var(--color-text-strong)] shadow-sm">
      <DebugPayloadBlock label="LLM request" payload={log.request_payload} />
      <DebugPayloadBlock label="LLM response" payload={log.response_payload} />
      {log.metadata ? (
        <DebugPayloadBlock label="Trace metadata" payload={log.metadata} collapsible />
      ) : null}
    </div>
  );
}

function DebugPayloadBlock({
  label,
  payload,
  collapsible = false,
}: {
  label: string;
  payload: Json | null;
  collapsible?: boolean;
}) {
  const content = (
    <pre className="mt-1 max-h-60 overflow-auto rounded-2xl bg-white/90 p-3 font-mono text-[11px] leading-snug text-[var(--color-text-strong)]">
      {formatJson(payload)}
    </pre>
  );

  if (collapsible) {
    return (
      <details className="rounded-2xl border border-[var(--color-border-subtle)] bg-white/70 p-3 text-xs text-[var(--color-text-strong)]">
        <summary className="cursor-pointer font-semibold text-[var(--color-text-secondary)]">
          {label}
        </summary>
        {content}
      </details>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </p>
      {content}
    </div>
  );
}

function formatJson(payload: Json | null | undefined) {
  try {
    return JSON.stringify(payload ?? null, null, 2);
  } catch {
    return "Unable to render payload.";
  }
}
