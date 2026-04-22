import { NextResponse } from "next/server";
import { z } from "zod";

import { createInterviewRouteContext, loadOwnedInterview } from "@/lib/interviews/server";

const eventSchema = z.object({
  origin: z.enum(["client", "server", "app"]),
  type: z.string().min(1),
  summary: z.string().nullable().optional(),
  payload: z.any().optional(),
  interviewMessageId: z.string().uuid().nullable().optional(),
});

const schema = z.object({
  interviewId: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(100),
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

  const interview = interviewResult.data;

  const insertPayload = payload.data.events.map((event) => ({
    interview_id: interview.id,
    interview_message_id: event.interviewMessageId ?? null,
    origin: event.origin,
    type: event.type,
    summary: event.summary ?? null,
    payload: event.payload ?? null,
  }));

  const result = await supabase
    .from("interview_realtime_events")
    .insert(insertPayload);

  if (result.error) {
    console.error("Failed to insert realtime interview events", result.error);
    return NextResponse.json(
      { error: "Could not record voice activity." },
      { status: 500 },
    );
  }

  return NextResponse.json({ count: insertPayload.length });
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
