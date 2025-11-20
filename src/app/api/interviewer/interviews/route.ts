import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InterviewerAgent } from "@/lib/interviews/agent";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to start a chat." }, { status: 401 });
  }

  const interviewResult = await supabase
    .from("user_interviews")
    .insert({
      user_id: user.id,
      name: buildInterviewName(),
    })
    .select("*")
    .single();

  if (interviewResult.error || !interviewResult.data) {
    console.error("Failed to create interview", interviewResult.error);
    return NextResponse.json(
      { error: "Unable to start a new interview right now." },
      { status: 500 },
    );
  }

  const interview = interviewResult.data;

  const agent = new InterviewerAgent();
  let openingMessage = "Welcome! Tell me a story from your life that you want to capture today.";

  try {
    openingMessage = await agent.generateOpeningMessage();
  } catch (error) {
    console.warn("Falling back to default opening prompt", error);
  }

  const messageResult = await supabase
    .from("interview_messages")
    .insert({
      interview_id: interview.id,
      author: "chat_interviewer",
      body: openingMessage,
    })
    .select("*")
    .single();

  if (messageResult.error || !messageResult.data) {
    console.error("Failed to create opening message", messageResult.error);
    return NextResponse.json(
      { error: "Interview created but failed to seed the opening prompt." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    interview,
    openingMessage: messageResult.data,
  });
}

function buildInterviewName(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  });
  return `Chat · ${formatter.format(new Date())}`;
}
