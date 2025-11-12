import { Button } from "@/components/ui/Button";
import type { BuilderAction } from "@/data/builder-actions";
import { cn } from "@/lib/utils";

const accentMap: Record<BuilderAction["accent"], string> = {
  ink: "bg-[color:var(--color-text-strong)] text-white",
  plum: "bg-[color:var(--color-text-secondary)] text-white",
  tide: "bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-strong)]",
  peach: "bg-[color:var(--color-accent-highlight)] text-[color:var(--color-text-strong)]",
};

type BuilderActionCardProps = {
  action: BuilderAction;
  ctaLabel?: string;
};

export function BuilderActionCard({ action, ctaLabel = "Start" }: BuilderActionCardProps) {
  const Icon = action.icon;
  return (
    <article className="flex items-center gap-4 rounded-3xl border border-[color:var(--color-border-subtle)] bg-white/95 p-5 shadow-sm">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-lg",
          accentMap[action.accent],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-[color:var(--color-text-strong)]">
          {action.title}
        </p>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          {action.description}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="ml-auto h-9 px-4 text-xs uppercase tracking-wide"
      >
        {ctaLabel}
      </Button>
    </article>
  );
}
