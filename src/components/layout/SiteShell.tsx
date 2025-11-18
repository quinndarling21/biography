import type { ReactNode } from "react";

import { MainNav } from "@/components/navigation/MainNav";
import { SiteFooter } from "@/components/navigation/SiteFooter";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-base)] text-[var(--color-text-strong)]">
      <MainNav />
      <main className="flex-1 overflow-hidden">{children}</main>
      <SiteFooter />
    </div>
  );
}
