import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InterviewerAgent } from "@/lib/interviews/agent";

const schema = z
  .object({
    mode: z.enum(["chat", "voice"]).optional(),
  })
  .optional();

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to start a chat." }, { status: 401 });
  }

  const payload = await safeParseRequest(request);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  const mode = payload.data.mode ?? "chat";

  const interviewResult = await supabase
    .from("user_interviews")
    .insert({
      user_id: user.id,
      mode,
      name: buildInterviewName(mode),
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

  if (mode === "voice") {
    return NextResponse.json({
      interview,
      openingMessage: null,
    });
  }

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
      author: "interviewer",
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

async function safeParseRequest(request: Request) {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return {
        success: false as const,
        status: 400,
        error: result.error.issues[0]?.message ?? "Invalid request.",
      };
    }
    return { success: true as const, data: result.data ?? {} };
  } catch {
    return {
      success: true as const,
      data: {},
    };
  }
}

function buildInterviewName(mode: "chat" | "voice"): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  });
  const label = mode === "voice" ? "Voice" : "Chat";
  return `${label} · ${formatter.format(new Date())}`;
}
