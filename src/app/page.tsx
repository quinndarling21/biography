import Link from "next/link";

import { BuilderWorkspacePanel } from "@/components/builder/BuilderWorkspacePanel";
import { TableOfContentsPanel } from "@/components/builder/TableOfContentsPanel";
import { TimelineProvider } from "@/components/providers/TimelineProvider";
import { BiographyDataService } from "@/lib/services/biography-data-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SignedOutState />;
  }

  const dataService = new BiographyDataService(supabase);
  await dataService.ensureUserProfile(user.id);
  const { data: timeline, error } = await dataService.getTimeline(user.id);
  if (error) {
    console.error("Failed to load timeline", error);
  }

  return (
    <TimelineProvider initialTimeline={timeline ?? []}>
      <div className="grid min-h-[calc(100vh-140px)] min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="flex min-h-0 flex-col">
          <TableOfContentsPanel className="flex-1 border-b border-[var(--color-border-subtle)] lg:border-b-0 lg:border-r" />
        </div>
        <div className="flex min-h-0 flex-col">
          <BuilderWorkspacePanel className="flex-1" />
        </div>
      </div>
    </TimelineProvider>
  );
}

function SignedOutState() {
  return (
    <section className="flex h-full flex-col items-center justify-center gap-6 px-6 py-16 text-center lg:py-24">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold text-[var(--color-text-strong)]">
          It&rsquo;s time to tell your story.
        </h1>
        <p className="text-base text-[var(--color-text-secondary)]">
          We all have a grand story to tell. Every milestone, memory, and story contributes to the life you&rsquo;ve lived. Over time, Biography asks questions about your life to uncover each and every piece of the puzzle and compiles it all into your personal life story so that, one day, you, your children, your grandchildren, and beyond can look back in awe.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-text-strong)] px-6 py-3 text-sm font-semibold text-on-strong transition hover:bg-[var(--color-text-strong)]/90"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}
