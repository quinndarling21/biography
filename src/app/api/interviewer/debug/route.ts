import { NextResponse } from "next/server";
import { z } from "zod";

import { InterviewerAgent } from "@/lib/interviews/agent";
import { loadInterviewContext } from "@/lib/interviews/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const serializedMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool", "unknown"]),
  content: z.string(),
  toolCallId: z.string().nullable().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string().nullable(),
        name: z.string(),
        args: z.record(z.any()).default({}),
      }),
    )
    .optional(),
});

const schema = z.object({
  interviewId: z.string().uuid(),
  request: z.object({
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    messages: z.array(serializedMessageSchema).min(1),
  }),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const adminResult = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (adminResult.error) {
    console.error("Failed to load user profile", adminResult.error);
    return NextResponse.json(
      { error: "Unable to confirm debug permissions." },
      { status: 500 },
    );
  }

  if (!adminResult.data?.is_admin) {
    return NextResponse.json(
      { error: "Only admins can preview interviewer prompts." },
      { status: 403 },
    );
  }

  const payload = await safeParseRequest(request);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error },
      { status: payload.status },
    );
  }

  const { interviewId, request: previewRequest } = payload.data;

  const interviewResult = await supabase
    .from("user_interviews")
    .select("id")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (interviewResult.error) {
    console.error("Failed to load interview for debug preview", interviewResult.error);
    return NextResponse.json(
      { error: "Unable to load this interview." },
      { status: 500 },
    );
  }

  if (!interviewResult.data) {
    return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  }

  try {
    const context = await loadInterviewContext(supabase, user.id, interviewId);
    const agent = new InterviewerAgent();
    const debug = await agent.preview({
      userId: user.id,
      interviewId,
      entries: context.entries,
      chapters: context.chapters,
      request: previewRequest,
    });

    return NextResponse.json(debug);
  } catch (error) {
    console.error("Interviewer preview failed", error);
    return NextResponse.json(
      { error: "The interviewer preview failed. Please try again." },
      { status: 500 },
    );
  }
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
