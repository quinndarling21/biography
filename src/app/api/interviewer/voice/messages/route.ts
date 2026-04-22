import { NextResponse } from "next/server";
import { z } from "zod";

import { createInterviewRouteContext, loadOwnedInterview } from "@/lib/interviews/server";

const schema = z.object({
  interviewId: z.string().uuid(),
  author: z.enum(["user", "interviewer"]),
  body: z.string().min(1, "Messages cannot be empty."),
  metadata: z.record(z.any()).nullable().optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await createInterviewRouteContext();

  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const payload = await safeParseRequest(request);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  const interviewResult = await loadOwnedInterview(
    supabase,
    user.id,
    payload.data.interviewId,
  );

  if (interviewResult.error || !interviewResult.data) {
    return NextResponse.json(
      { error: interviewResult.error },
      { status: interviewResult.status },
    );
  }

  if (
    payload.data.author === "user" &&
    interviewResult.data.status === "closed"
  ) {
    return NextResponse.json(
      { error: "Reopen this interview before recording more user messages." },
      { status: 400 },
    );
  }

  const result = await supabase
    .from("interview_messages")
    .insert({
      interview_id: interviewResult.data.id,
      author: payload.data.author,
      body: payload.data.body.trim(),
      metadata: payload.data.metadata ?? null,
    })
    .select("*")
    .single();

  if (result.error || !result.data) {
    console.error("Failed to store voice interview message", result.error);
    return NextResponse.json(
      { error: "Could not record that message." },
      { status: 500 },
    );
  }

  const latestInterview = await supabase
    .from("user_interviews")
    .select("*")
    .eq("id", interviewResult.data.id)
    .single();

  return NextResponse.json({
    message: result.data,
    interview: latestInterview.data ?? null,
  });
}

async function safeParseRequest(request: Request) {
  try {
    const json = await request.json();
    const result = schema.safeParse(json);
    if (!result.success) {
      return {
        success: false as const,
        status: 400,
        error: result.error.issues[0]?.message ?? "Invalid request.",
      };
    }
    return { success: true as const, data: result.data };
  } catch {
    return {
      success: false as const,
      status: 400,
      error: "Request body must be JSON.",
    };
  }
}
