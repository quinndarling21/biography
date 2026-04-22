"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  Loader2,
  Lock,
  Play,
  Plus,
  RotateCcw,
  Send,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ManualEntryDialog } from "@/components/builder/dialogs/ManualEntryDialog";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import {
  chapterEntryToManualRecord,
  manualEntryDraftToUpdate,
} from "@/data/manual-entries";
import type {
  InterviewerAgentDebugTrace,
  InterviewerAgentRequestPayload,
  InterviewerAgentResponsePayload,
  LlmDebugIteration,
  SerializedLlmMessage,
  ToolInvocationTrace,
} from "@/lib/interviews/debug";
import {
  formatAbsoluteDate,
  formatInterviewTitle,
} from "@/lib/interviews/utils";
import { BiographyDataService } from "@/lib/services/biography-data-service";
import type { UserChapter } from "@/lib/services/biography-data-service";
import {
  InterviewService,
  type InterviewDebugLog,
  type InterviewEntryRecord,
  type InterviewMessageEntryAction,
  type InterviewMessage,
  type UserInterview,
  parseInterviewMessageMetadata,
} from "@/lib/services/interview-service";
import type { Json } from "@/lib/supabase/types";
import { formatEntryDateLabel } from "@/lib/timeline/transformers";
import { cn } from "@/lib/utils";

type ConversationMap = Record<string, InterviewMessage[]>;
type EntryMap = Record<string, InterviewEntryRecord[]>;
type DebugLogMap = Record<string, InterviewDebugLog[]>;
type ChapterEntry = NonNullable<InterviewEntryRecord["chapter_entries"]>;
type PendingUserMessage = {
  id: string;
  body: string;
};

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
  const [pendingUserMessage, setPendingUserMessage] =
    useState<PendingUserMessage | null>(null);
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
  const [debugRequestDraft, setDebugRequestDraft] = useState("");
  const [debugPreviewTrace, setDebugPreviewTrace] =
    useState<InterviewerAgentDebugTrace | null>(null);
  const [debugPreviewError, setDebugPreviewError] = useState<string | null>(null);
  const [previewingDebugRequest, setPreviewingDebugRequest] = useState(false);
  const [debugSourceLabel, setDebugSourceLabel] = useState<string | null>(null);

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
  const latestDebugLog =
    activeDebugLogs && activeDebugLogs.length > 0
      ? activeDebugLogs[activeDebugLogs.length - 1]
      : null;

  const canChat = Boolean(activeInterview && activeInterview.status === "in_progress");
  const entries: ChapterEntry[] = (activeEntries ?? [])
    .map((record) => record.chapter_entries)
    .filter((entry): entry is ChapterEntry => Boolean(entry));
  const entryById = useMemo(
    () =>
      entries.reduce<Record<string, ChapterEntry>>((acc, entry) => {
        acc[entry.id] = entry;
        return acc;
      }, {}),
    [entries],
  );
  const activeEntryRecord = useMemo(
    () =>
      entryDialogTarget ? chapterEntryToManualRecord(entryDialogTarget.entry) : null,
    [entryDialogTarget],
  );

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const debugAutoLoadInterviewRef = useRef<string | null>(null);

  useEffect(() => {
    const container = messageViewportRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages, activeInterviewId, pendingUserMessage, sending]);

  const cacheConversation = useCallback(
    (interviewId: string, payload: ConversationMap[string]) => {
      setMessagesByInterview((prev) => ({
        ...prev,
        [interviewId]: payload,
      }));
    },
    [],
  );

  const appendConversationMessages = useCallback(
    (interviewId: string, payload: InterviewMessage[]) => {
      setMessagesByInterview((prev) => ({
        ...prev,
        [interviewId]: [...(prev[interviewId] ?? []), ...payload],
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

  const loadDebugLogIntoLab = useCallback((log: InterviewDebugLog) => {
    if (!isInterviewerRequestPayload(log.request_payload)) {
      setDebugPreviewError("This stored request payload is missing the expected debug format.");
      return;
    }

    setDebugRequestDraft(JSON.stringify(log.request_payload, null, 2));
    setDebugPreviewTrace(buildTraceFromLog(log));
    setDebugPreviewError(null);
    setDebugSourceLabel(`Loaded from ${formatAbsoluteDate(log.created_at)}`);
  }, []);

  useEffect(() => {
    if (!isAdmin || !showDebug || !activeInterviewId) {
      return;
    }

    if (debugAutoLoadInterviewRef.current === activeInterviewId) {
      return;
    }

    debugAutoLoadInterviewRef.current = activeInterviewId;

    const frame = window.requestAnimationFrame(() => {
      if (latestDebugLog) {
        loadDebugLogIntoLab(latestDebugLog);
        return;
      }

      setDebugRequestDraft("");
      setDebugPreviewTrace(null);
      setDebugPreviewError(null);
      setDebugSourceLabel(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    activeInterviewId,
    isAdmin,
    latestDebugLog,
    loadDebugLogIntoLab,
    showDebug,
  ]);

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
    [cacheConversation, cacheDebugLogs, cacheEntries, interviewService, isAdmin],
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
      setPendingUserMessage(null);
      setActiveInterviewId(interviewId);
      debugAutoLoadInterviewRef.current = null;
      if (!messagesByInterview[interviewId]) {
        await loadConversation(interviewId);
      }
    },
    [loadConversation, messagesByInterview],
  );

  const handleStartInterview = useCallback(async () => {
    if (creating) {
      return;
    }
    setError(null);
    setCreating(true);
    const result = await interviewService.createInterview({ mode: "chat" });
    if (result.error) {
      setError(result.error.message);
      setCreating(false);
      return;
    }

    const { interview, openingMessage } = result.data;
    setInterviews((prev) => [interview, ...prev]);
    setActiveInterviewId(interview.id);
    debugAutoLoadInterviewRef.current = null;
    cacheConversation(interview.id, openingMessage ? [openingMessage] : []);
    setCreating(false);
  }, [cacheConversation, creating, interviewService]);

  const handleRunDebugPreview = useCallback(async () => {
    if (!activeInterviewId || previewingDebugRequest) {
      return;
    }

    let parsedRequest: unknown;
    try {
      parsedRequest = JSON.parse(debugRequestDraft);
    } catch {
      setDebugPreviewError("Debug request must be valid JSON before you can preview it.");
      return;
    }

    if (!isInterviewerRequestPayload(parsedRequest)) {
      setDebugPreviewError(
        "Debug request JSON must include `model`, `temperature`, and a `messages` array.",
      );
      return;
    }

    setDebugPreviewError(null);
    setPreviewingDebugRequest(true);

    const result = await interviewService.previewDebugRequest({
      interviewId: activeInterviewId,
      request: parsedRequest,
    });

    if (result.error) {
      setDebugPreviewError(result.error.message);
      setPreviewingDebugRequest(false);
      return;
    }

    setDebugPreviewTrace(result.data);
    setDebugSourceLabel("Dry-run preview");
    setPreviewingDebugRequest(false);
  }, [
    activeInterviewId,
    debugRequestDraft,
    interviewService,
    previewingDebugRequest,
  ]);

  const handleSend = useCallback(async () => {
    if (!activeInterviewId || !message.trim() || sending || !canChat) {
      return;
    }

    const payload = message.trim();
    setMessage("");
    setPendingUserMessage({
      id: buildOptimisticMessageId(),
      body: payload,
    });
    setSending(true);
    setError(null);

    const result = await interviewService.sendUserMessage({
      interviewId: activeInterviewId,
      body: payload,
    });

    if (result.error) {
      setError(result.error.message);
      setMessage(payload);
      setPendingUserMessage(null);
      setSending(false);
      return;
    }

    setPendingUserMessage(null);
    appendConversationMessages(activeInterviewId, [
      result.data.userMessage,
      result.data.interviewerMessage,
    ]);

    if (result.data.interview) {
      setInterviews((prev) =>
        prev.map((interview) =>
          interview.id === result.data.interview?.id ? result.data.interview : interview,
        ),
      );
    }

    const needsEntryRefresh =
      result.data.createdEntryIds.length > 0 || result.data.updatedEntryIds.length > 0;
    await Promise.all([
      needsEntryRefresh ? refreshEntries(activeInterviewId) : Promise.resolve(),
      isAdmin ? refreshDebugLogs(activeInterviewId) : Promise.resolve(),
    ]);

    setSending(false);
  }, [
    activeInterviewId,
    appendConversationMessages,
    canChat,
    interviewService,
    isAdmin,
    message,
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
      ? "Share the next milestone, memory, or story you want to capture."
      : "Reopen this chat to keep capturing your story."
    : "Select a conversation to begin chatting.";

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
              {activeInterview
                ? formatInterviewTitle(activeInterview)
                : "Select a conversation"}
            </p>
            {activeInterview ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {activeInterview.status === "in_progress" ? "In progress" : "Closed"}{" "}
                • Started {formatAbsoluteDate(activeInterview.created_at)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setShowDebug((prev) => !prev);
                  debugAutoLoadInterviewRef.current = null;
                }}
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
                  if (!activeInterviewId) {
                    return;
                  }
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
            className="max-h-[60vh] min-h-[240px] space-y-4 overflow-y-auto rounded-3xl border border-[var(--color-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,241,235,0.78)_100%)] p-4"
          >
            {loadingConversation ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading conversation...
              </div>
            ) : !activeInterview ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Select a conversation from the left or start a new chat to begin.
              </p>
            ) : (activeMessages?.length ?? 0) === 0 && !pendingUserMessage ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Walter will kick things off once you send your first message.
              </p>
            ) : (
              <>
                {activeMessages?.map((messageItem) => (
                  <MessageBubble
                    key={`${messageItem.id}-${messageItem.sequence}`}
                    message={messageItem}
                    entryById={entryById}
                    debugEnabled={isAdmin && showDebug}
                    debugLog={activeDebugLogMap[messageItem.id]}
                    onOpenEntry={
                      activeInterviewId
                        ? (entry) => {
                            setEntryDialogTarget({
                              entry,
                              interviewId: activeInterviewId,
                            });
                          }
                        : undefined
                    }
                    onLoadDebugRequest={
                      isAdmin && showDebug
                        ? (log) => loadDebugLogIntoLab(log)
                        : undefined
                    }
                  />
                ))}
                {pendingUserMessage ? (
                  <PendingMessageBubble body={pendingUserMessage.body} />
                ) : null}
                {sending ? <ThinkingBubble /> : null}
              </>
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                Walter will capture new moments as draft entries and then keep digging for detail.
              </p>
              <Button type="submit" size="md" disabled={sending || !message.trim()}>
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

        {isAdmin && showDebug && activeInterviewId ? (
          <DebugWorkbench
            draft={debugRequestDraft}
            sourceLabel={debugSourceLabel}
            previewTrace={debugPreviewTrace}
            previewError={debugPreviewError}
            previewing={previewingDebugRequest}
            hasStoredLog={Boolean(latestDebugLog)}
            onDraftChange={setDebugRequestDraft}
            onLoadLatest={() => {
              if (latestDebugLog) {
                loadDebugLogIntoLab(latestDebugLog);
              }
            }}
            onRunPreview={() => {
              void handleRunDebugPreview();
            }}
          />
        ) : null}
      </section>

      <aside className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          Entries captured
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          New stories appear here as Walter captures them.
        </p>
        {entries.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">
            No entries yet. Share a milestone, memory, or story and the interviewer will draft it here.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {entries.map((entry) => {
              const statusLabel = entry.status === "published" ? "Published" : "Draft";
              const statusStyles =
                entry.status === "published"
                  ? "bg-[var(--color-accent-primary)]/30 text-[var(--color-text-strong)]"
                  : "bg-[var(--color-accent-highlight)]/50 text-[var(--color-text-strong)]";

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeInterviewId) {
                        return;
                      }
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
  entryById,
  debugEnabled = false,
  debugLog,
  onOpenEntry,
  onLoadDebugRequest,
}: {
  message: InterviewMessage;
  entryById: Record<string, ChapterEntry>;
  debugEnabled?: boolean;
  debugLog?: InterviewDebugLog;
  onOpenEntry?: (entry: ChapterEntry) => void;
  onLoadDebugRequest?: (log: InterviewDebugLog) => void;
}) {
  const isUser = message.author === "user";
  const showDebug = debugEnabled && !isUser;
  const entryActions = isUser
    ? []
    : parseInterviewMessageMetadata(message.metadata).entryActions ?? [];

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
        {!isUser && entryActions.length > 0 ? (
          <MessageEntryActions
            actions={entryActions}
            entryById={entryById}
            onOpenEntry={onOpenEntry}
          />
        ) : null}
      </div>
      {showDebug ? (
        <DebugPanel
          log={debugLog ?? null}
          onLoadRequest={onLoadDebugRequest}
        />
      ) : null}
    </div>
  );
}

function PendingMessageBubble({ body }: { body: string }) {
  return (
    <div className="flex flex-col items-end gap-2 text-on-strong">
      <div className="max-w-[75%] rounded-2xl bg-[var(--color-text-strong)]/90 px-4 py-3 text-sm shadow-sm">
        <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex flex-col items-start gap-2 text-[var(--color-text-strong)]">
      <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-[var(--color-accent-primary)]"
              style={{ animationDelay: `${index * 0.14}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageEntryActions({
  actions,
  entryById,
  onOpenEntry,
}: {
  actions: InterviewMessageEntryAction[];
  entryById: Record<string, ChapterEntry>;
  onOpenEntry?: (entry: ChapterEntry) => void;
}) {
  return (
    <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const entry = entryById[action.entryId];
          const label = action.action === "created" ? "Entry created" : "Entry updated";

          if (!entry) {
            return (
              <span
                key={`${action.action}-${action.entryId}`}
                className="inline-flex rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]"
              >
                {label}
              </span>
            );
          }

          return (
            <button
              key={`${action.action}-${action.entryId}`}
              type="button"
              onClick={() => onOpenEntry?.(entry)}
              className="inline-flex rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] px-3 py-1 text-left text-[11px] font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-text-strong)] hover:text-[var(--color-text-strong)]"
            >
              {label}: {entry.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DebugWorkbench({
  draft,
  sourceLabel,
  previewTrace,
  previewError,
  previewing,
  hasStoredLog,
  onDraftChange,
  onLoadLatest,
  onRunPreview,
}: {
  draft: string;
  sourceLabel: string | null;
  previewTrace: InterviewerAgentDebugTrace | null;
  previewError: string | null;
  previewing: boolean;
  hasStoredLog: boolean;
  onDraftChange: (value: string) => void;
  onLoadLatest: () => void;
  onRunPreview: () => void;
}) {
  return (
    <section className="mt-4 space-y-3 rounded-3xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/65 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--color-text-secondary)]">
            Prompt Lab
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Edit the raw request payload, run a dry preview, and inspect the full LLM trace without writing to the database.
          </p>
          {sourceLabel ? (
            <p className="mt-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              {sourceLabel}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!hasStoredLog}
            onClick={onLoadLatest}
            className="text-xs"
          >
            <WandSparkles className="h-4 w-4" aria-hidden />
            <span className="ml-2">Load latest</span>
          </Button>
          <Button
            type="button"
            size="md"
            disabled={!draft.trim() || previewing}
            onClick={onRunPreview}
            className="text-xs"
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            <span className="ml-2">{previewing ? "Running preview" : "Run dry preview"}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Request payload
          </label>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder='{"model":"gpt-4.1-mini","temperature":0.4,"messages":[...]}'
            className="min-h-[320px] w-full resize-y rounded-2xl border border-[var(--color-border-subtle)] bg-white/90 p-4 font-mono text-[12px] leading-relaxed text-[var(--color-text-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-highlight)]"
          />
        </div>
        <div className="space-y-3">
          {previewError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {previewError}
            </div>
          ) : null}
          <DebugPayloadBlock
            label="Response payload"
            payload={previewTrace?.response ?? null}
          />
          <DebugPayloadBlock
            label="Trace metadata"
            payload={previewTrace?.metadata ?? null}
            collapsible
          />
        </div>
      </div>
    </section>
  );
}

function DebugPanel({
  log,
  onLoadRequest,
}: {
  log: InterviewDebugLog | null;
  onLoadRequest?: (log: InterviewDebugLog) => void;
}) {
  if (!log) {
    return (
      <div className="max-w-[85%] rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-white/80 px-4 py-3 text-xs text-[var(--color-text-secondary)] shadow-sm">
        No debug payload recorded for this reply yet.
      </div>
    );
  }

  return (
    <div className="max-w-[85%] space-y-3 rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/80 p-4 text-[var(--color-text-strong)] shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Debug trace
        </p>
        {onLoadRequest ? (
          <button
            type="button"
            onClick={() => onLoadRequest(log)}
            className="rounded-full border border-[var(--color-border-subtle)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-text-strong)] hover:text-[var(--color-text-strong)]"
          >
            Load into lab
          </button>
        ) : null}
      </div>
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
  payload: Json | InterviewerAgentResponsePayload | InterviewerAgentDebugTrace["metadata"] | null;
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

function formatJson(payload: unknown) {
  try {
    return JSON.stringify(payload ?? null, null, 2);
  } catch {
    return "Unable to render payload.";
  }
}

function buildOptimisticMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `optimistic-${Date.now()}`;
}

function buildTraceFromLog(log: InterviewDebugLog): InterviewerAgentDebugTrace | null {
  if (
    !isInterviewerRequestPayload(log.request_payload) ||
    !isInterviewerResponsePayload(log.response_payload)
  ) {
    return null;
  }

  return {
    request: log.request_payload,
    response: log.response_payload,
    metadata: isDebugMetadata(log.metadata)
      ? log.metadata
      : {
          iterations: [],
          toolRuns: [],
        },
  };
}

function isInterviewerRequestPayload(
  payload: unknown,
): payload is InterviewerAgentRequestPayload {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.model === "string" &&
    typeof payload.temperature === "number" &&
    Array.isArray(payload.messages) &&
    payload.messages.every(isSerializedLlmMessage)
  );
}

function isInterviewerResponsePayload(
  payload: unknown,
): payload is InterviewerAgentResponsePayload {
  return (
    isRecord(payload) &&
    "message" in payload &&
    isSerializedLlmMessage(payload.message)
  );
}

function isDebugMetadata(
  payload: unknown,
): payload is { iterations: LlmDebugIteration[]; toolRuns: ToolInvocationTrace[] } {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    Array.isArray(payload.iterations) &&
    Array.isArray(payload.toolRuns)
  );
}

function isSerializedLlmMessage(value: unknown): value is SerializedLlmMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.role === "string" &&
    typeof value.content === "string" &&
    (value.toolCalls === undefined ||
      (Array.isArray(value.toolCalls) && value.toolCalls.every(isSerializedToolCall)))
  );
}

function isSerializedToolCall(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (typeof value.id === "string" || value.id === null) &&
    (value.args === undefined || isRecord(value.args))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
