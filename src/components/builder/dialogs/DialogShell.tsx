import type { ReactNode } from "react";
import { X } from "lucide-react";

type DialogShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function DialogShell({
  open,
  title,
  description,
  onClose,
  children,
}: DialogShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 text-[var(--color-text-muted)] transition hover:text-[var(--color-text-secondary)]"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="space-y-2 pb-4 pr-10">
          <p className="text-base font-semibold text-[var(--color-text-strong)]">
            {title}
          </p>
          {description ? (
            <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
