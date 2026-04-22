import { redirect } from "next/navigation";

import { loadInterviewerPageData } from "@/app/interviewer/load-page-data";
import { VoiceInterviewerScreen } from "@/app/interviewer/voice/ui/VoiceInterviewerScreen";

export default async function VoiceInterviewerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const data = await loadInterviewerPageData({
    mode: "voice",
    searchParams: resolvedSearchParams,
  });

  if (!data.user) {
    redirect("/login");
  }

  return (
    <VoiceInterviewerScreen
      initialInterviews={data.interviews}
      initialMessages={data.initialMessages}
      initialEntries={data.initialEntries}
      initialRealtimeEvents={data.initialRealtimeEvents}
      initialInterviewId={data.initialInterviewId}
      initialChapters={data.initialChapters}
    />
  );
}
