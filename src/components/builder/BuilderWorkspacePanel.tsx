"use client";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { BuilderActionCard } from "@/components/builder/BuilderActionCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import { useTimeline } from "@/components/providers/TimelineProvider";
import {
  INTERVIEW_OPTIONS,
  MANUAL_ACTIONS,
} from "@/data/builder-actions";
import type { EntryType } from "@/data/chapters";
import type { ManualEntryDraft } from "@/data/manual-entries";
import type { ServiceResult } from "@/lib/services/biography-data-service";
import { formatInterviewTitle, formatUpdatedLabel } from "@/lib/interviews/utils";
import { InterviewService } from "@/lib/services/interview-service";
import { cn } from "@/lib/utils";

import { ManualEntryDialog } from "./dialogs/ManualEntryDialog";

type BuilderWorkspacePanelProps = {
  className?: string;
};

export function BuilderWorkspacePanel({
  className,
}: BuilderWorkspacePanelProps) {
  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden bg-[var(--color-surface-base)]",
        className,
      )}
    >
      <div className="flex-1 overflow-y-auto p-8">
        <WorkspaceInner />
      </div>
    </section>
  );
}

function WorkspaceInner() {
  const [mode, setMode] = useState<"interview" | "manual">("interview");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          Build your biography
        </p>
      </header>

      <ModeTabs mode={mode} onChange={setMode} />
      {mode === "interview" ? <InterviewMode /> : <ManualMode />}
    </div>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: "interview" | "manual";
  onChange: (value: "interview" | "manual") => void;
}) {
  const tabs = [
    { id: "interview", label: "Interview" },
    { id: "manual", label: "Manual" },
  ] as const;

  return (
    <div className="inline-flex rounded-full border border-[var(--color-border-subtle)] bg-white/70 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            mode === tab.id
              ? "bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-highlight)]/30",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function InterviewMode() {
  const router = useRouter();

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        {INTERVIEW_OPTIONS.map((option) => {
          const isVoice = option.id === "voice-interview";
          return (
            <BuilderActionCard
              key={option.id}
              action={option}
              ctaLabel="Begin"
              onAction={() => {
                const destination = (isVoice
                  ? "/interviewer/voice"
                  : "/interviewer") as Route;
                router.push(destination);
              }}
            />
          );
        })}
      </div>
      <RecentConversations />
    </section>
  );
}

function ManualMode() {
  const { userChapters, mutating, createManualEntry } = useTimeline();
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const hasChapters = userChapters.length > 0;

  const handleSubmit = (draft: ManualEntryDraft): Promise<ServiceResult<unknown>> =>
    createManualEntry(draft);

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            Manual additions
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Capture milestones, memories, or stories directly in your chapters.
          </p>
        </div>
        {MANUAL_ACTIONS.map((action) => (
          <BuilderActionCard
            key={action.id}
            action={action}
            disabled={!hasChapters}
            onAction={() => setEntryType(action.id as EntryType)}
          />
        ))}
        {!hasChapters ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Add a chapter before logging manual entries.
          </p>
        ) : null}
      </div>
      {entryType ? (
        <ManualEntryDialog
          key={`create-${entryType}`}
          open
          mode="create"
          entryType={entryType}
          chapters={userChapters}
          submitting={mutating}
          onClose={() => setEntryType(null)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

type RecentConversation = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mode: "chat" | "voice";
};

function RecentConversations() {
  const { user } = useAuth();
  const supabase = useSupabase();
  const interviewService = useMemo(
    () => new InterviewService(supabase),
    [supabase],
  );
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!user) {
        if (isMounted) {
          setConversations([]);
        }
        return;
      }
      setLoading(true);
      const { data, error } = await interviewService.listInterviews(user.id);
      if (!isMounted) return;
      if (error) {
        console.error("Failed to load interviews", error);
        setConversations([]);
        setLoading(false);
        return;
      }
      const subset = (data ?? []).slice(0, 3);
      const enriched = await Promise.all(
        subset.map(async (interview) => {
          const { data: latest, error: latestError } = await supabase
            .from("interview_messages")
            .select("ts")
            .eq("interview_id", interview.id)
            .order("sequence", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestError) {
            console.error(
              `Failed to load last message timestamp for interview ${interview.id}`,
              latestError,
            );
          }
          return {
            id: interview.id,
            name: interview.name,
            createdAt: interview.created_at,
            updatedAt: latest?.ts ?? interview.closed_at ?? interview.created_at,
            mode: interview.mode,
          } satisfies RecentConversation;
        }),
      );
      if (!isMounted) return;
      setConversations(enriched);
      setLoading(false);
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [interviewService, supabase, user]);

  return (
    <article className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-strong)]">Recent conversations</p>
          <p className="text-xs text-[var(--color-text-muted)]">Pick up where you left off.</p>
        </div>
        <Link
          href="/interviewer"
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          View all
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading conversations...
        </div>
      ) : conversations.length === 0 ? (
        <p className="py-4 text-sm text-[var(--color-text-muted)]">
          Start a chat or voice interview to see it appear here.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="py-3">
              {(() => {
                const href = `${
                  conversation.mode === "voice" ? "/interviewer/voice" : "/interviewer"
                }?interview=${conversation.id}` as Route;

                return (
              <Link
                href={href}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-strong)]">
                    {formatInterviewTitle({
                      created_at: conversation.createdAt,
                      name: conversation.name,
                      mode: conversation.mode,
                    })}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Updated {formatUpdatedLabel(conversation.updatedAt)}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--color-border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {conversation.mode === "voice" ? "Voice" : "Chat"}
                </span>
              </Link>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
