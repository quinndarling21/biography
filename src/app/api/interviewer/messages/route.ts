import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InterviewerAgent } from "@/lib/interviews/agent";
import { loadInterviewContext } from "@/lib/interviews/context";

const schema = z.object({
  interviewId: z.string().uuid(),
  body: z.string().min(1, "Messages cannot be empty."),
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
  }

  const isAdmin = Boolean(adminResult.data?.is_admin);

  const payload = await safeParseRequest(request);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error },
      { status: payload.status },
    );
  }

  const { interviewId, body } = payload.data;

  const trimmed = body.trim();

  const interviewResult = await supabase
    .from("user_interviews")
    .select("*")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (interviewResult.error) {
    console.error("Failed to load interview", interviewResult.error);
    return NextResponse.json(
      { error: "Unable to load this interview." },
      { status: 500 },
    );
  }

  if (!interviewResult.data) {
    return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  }

  if (interviewResult.data.status === "closed") {
    return NextResponse.json(
      { error: "Reopen this interview before sending new messages." },
      { status: 400 },
    );
  }

  const userMessageResult = await supabase
    .from("interview_messages")
    .insert({
      interview_id: interviewId,
      author: "user",
      body: trimmed,
    })
    .select("*")
    .single();

  if (userMessageResult.error || !userMessageResult.data) {
    console.error("Failed to store user message", userMessageResult.error);
    return NextResponse.json(
      { error: "Could not record your message. Try again." },
      { status: 500 },
    );
  }

  const context = await loadInterviewContext(supabase, user.id, interviewId);
  const agent = new InterviewerAgent();

  try {
    const agentResult = await agent.respond({
      supabase,
      userId: user.id,
      interviewId,
      messages: context.messages,
      entries: context.entries,
      chapters: context.chapters,
    });

    const interviewerMessageResult = await supabase
      .from("interview_messages")
      .insert({
        interview_id: interviewId,
        author: "interviewer",
        body: agentResult.reply,
        metadata: buildInterviewerMessageMetadata(
          agentResult.createdEntryIds,
          agentResult.updatedEntryIds,
          agentResult.closedInterview,
        ),
      })
      .select("*")
      .single();

    if (interviewerMessageResult.error || !interviewerMessageResult.data) {
      console.error(
        "Failed to store interviewer message",
        interviewerMessageResult.error,
      );
      return NextResponse.json(
        { error: "Could not record the interviewer reply." },
        { status: 500 },
      );
    }

    if (isAdmin) {
      const debugInsert = await supabase
        .from("interview_message_debug_logs")
        .insert({
          interview_id: interviewId,
          interview_message_id: interviewerMessageResult.data.id,
          request_payload: agentResult.debug.request,
          response_payload: agentResult.debug.response,
          metadata: agentResult.debug.metadata,
        });

      if (debugInsert.error) {
        console.error("Failed to store interviewer debug log", debugInsert.error);
      }
    }

    const updatedInterviewResult = agentResult.closedInterview
      ? await supabase
          .from("user_interviews")
          .select("*")
          .eq("id", interviewId)
          .single()
      : null;

    if (updatedInterviewResult?.error) {
      console.error("Failed to load closed interview after completion", updatedInterviewResult.error);
    }

    return NextResponse.json({
      userMessage: userMessageResult.data,
      interviewerMessage: interviewerMessageResult.data,
      createdEntryIds: agentResult.createdEntryIds,
      updatedEntryIds: agentResult.updatedEntryIds,
      closedInterview: agentResult.closedInterview,
      interview: updatedInterviewResult?.data ?? null,
    });
  } catch (error) {
    console.error("Interviewer agent failed", error);
    return NextResponse.json(
      { error: "The interviewer was unable to respond. Please try again." },
      { status: 500 },
    );
  }
}

function buildInterviewerMessageMetadata(
  createdEntryIds: string[],
  updatedEntryIds: string[],
  closedInterview: boolean,
) {
  const entryActions = [
    ...createdEntryIds.map((entryId) => ({
      action: "created" as const,
      entryId,
    })),
    ...updatedEntryIds.map((entryId) => ({
      action: "updated" as const,
      entryId,
    })),
  ];

  if (!entryActions.length && !closedInterview) {
    return null;
  }

  return {
    ...(entryActions.length ? { entryActions } : {}),
    ...(closedInterview ? { conversation: { ended: true } } : {}),
  };
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
