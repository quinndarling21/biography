"use client";
import { useState } from "react";

import { BuilderActionCard } from "@/components/builder/BuilderActionCard";
import { Button } from "@/components/ui/Button";
import {
  INTERVIEW_OPTIONS,
  MANUAL_ACTIONS,
  RECENT_CONVERSATIONS,
} from "@/data/builder-actions";
import { cn } from "@/lib/utils";

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
  return (
    <section className="space-y-6">
      <div className="space-y-4">
        {INTERVIEW_OPTIONS.map((option) => (
          <BuilderActionCard key={option.id} action={option} ctaLabel="Begin" />
        ))}
      </div>
      <RecentConversations />
    </section>
  );
}

function ManualMode() {
  return (
    <section className="space-y-6">
      <div className="space-y-4">
        {MANUAL_ACTIONS.map((action) => (
          <BuilderActionCard key={action.id} action={action} />
        ))}
      </div>
    </section>
  );
}

function RecentConversations() {
  return (
    <article className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-strong)]">Recent conversations</p>
          <p className="text-xs text-[var(--color-text-muted)]">Pick up where you left off.</p>
        </div>
        <Button variant="ghost" size="md" className="text-sm font-medium text-[var(--color-text-secondary)]">
          View all
        </Button>
      </div>
      <ul className="divide-y divide-[var(--color-border-subtle)]">
        {RECENT_CONVERSATIONS.map((conversation) => (
          <li key={conversation.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-strong)]">{conversation.title}</p>
              <p className="text-xs text-[var(--color-text-muted)]">Updated {conversation.updatedAt}</p>
            </div>
            <span className="rounded-full border border-[var(--color-border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              {conversation.mode === "voice" ? "Voice" : "Chat"}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
