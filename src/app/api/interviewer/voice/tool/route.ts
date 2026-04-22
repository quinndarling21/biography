import { NextResponse } from "next/server";
import { z } from "zod";

import { loadInterviewContext } from "@/lib/interviews/context";
import { createInterviewRouteContext, loadOwnedInterview } from "@/lib/interviews/server";
import { buildInterviewTools } from "@/lib/interviews/tools";
import type { Json } from "@/lib/supabase/types";

const schema = z.object({
  interviewId: z.string().uuid(),
  toolName: z.string().min(1),
  callId: z.string().nullable().optional(),
  args: z.record(z.any()).default({}),
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

  const context = await loadInterviewContext(
    supabase,
    user.id,
    interviewResult.data.id,
  );

  const { tools, tracker } = buildInterviewTools(
    {
      supabase,
      userId: user.id,
      interviewId: interviewResult.data.id,
      entries: context.entries,
      chapters: context.chapters,
    },
    { mode: "live" },
  );

  const tool = tools.find((candidate) => candidate.name === payload.data.toolName);
  if (!tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${payload.data.toolName}` },
      { status: 400 },
    );
  }

  try {
    const invocationResult = await tool.invoke(
      payload.data.args as Record<string, Json | undefined>,
    );

    const interview =
      tracker.closedInterview
        ? (
            await supabase
              .from("user_interviews")
              .select("*")
              .eq("id", interviewResult.data.id)
              .single()
          ).data ?? null
        : null;

    return NextResponse.json({
      output: {
        ok:
          typeof invocationResult === "string"
            ? !invocationResult.startsWith("Failed")
            : true,
        message:
          typeof invocationResult === "string"
            ? invocationResult
            : JSON.stringify(invocationResult),
        createdEntryIds: tracker.createdEntries,
        updatedEntryIds: tracker.updatedEntries,
        closedInterview: tracker.closedInterview,
      },
      createdEntryIds: tracker.createdEntries,
      updatedEntryIds: tracker.updatedEntries,
      closedInterview: tracker.closedInterview,
      interview,
    });
  } catch (error) {
    console.error("Voice tool execution failed", error);
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("expected schema") ? 400 : 500;
    return NextResponse.json(
      {
        error:
          status === 400
            ? "The interviewer produced an invalid tool payload."
            : "The interviewer could not run that tool.",
      },
      { status },
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
