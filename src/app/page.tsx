import { BuilderWorkspacePanel } from "@/components/builder/BuilderWorkspacePanel";
import { TableOfContentsPanel } from "@/components/builder/TableOfContentsPanel";

export default function Home() {
  return (
    <div className="grid min-h-[calc(100vh-140px)] min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <TableOfContentsPanel className="flex-1 border-b border-[color:var(--color-border-subtle)] lg:border-b-0 lg:border-r" />
      </div>
      <div className="flex min-h-0 flex-col">
        <BuilderWorkspacePanel className="flex-1" />
      </div>
    </div>
  );
}
