import { Button } from "@/components/ui/Button";
import type { BuilderAction } from "@/data/builder-actions";
import { cn } from "@/lib/utils";

const accentMap: Record<BuilderAction["accent"], string> = {
  ink: "bg-[var(--color-text-strong)] text-on-strong",
  plum: "bg-[var(--color-text-secondary)] text-on-strong",
  tide: "bg-[var(--color-accent-primary)] text-[var(--color-text-strong)]",
  peach: "bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]",
};

type BuilderActionCardProps = {
  action: BuilderAction;
  ctaLabel?: string;
  disabled?: boolean;
  onAction?: (action: BuilderAction) => void;
};

export function BuilderActionCard({
  action,
  ctaLabel = "Start",
  disabled,
  onAction,
}: BuilderActionCardProps) {
  const Icon = action.icon;
  return (
    <article className="flex items-center gap-4 rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-5 shadow-sm">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-lg",
          accentMap[action.accent],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-[var(--color-text-strong)]">
          {action.title}
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          {action.description}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={disabled}
        onClick={() => onAction?.(action)}
        className={cn(
          "ml-auto h-9 px-4 text-xs uppercase tracking-wide",
          disabled ? "opacity-60" : "",
        )}
      >
        {ctaLabel}
      </Button>
    </article>
  );
}
