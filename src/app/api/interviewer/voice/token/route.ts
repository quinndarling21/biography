import { NextResponse } from "next/server";
import { z } from "zod";

import { loadInterviewContext } from "@/lib/interviews/context";
import { buildVoiceRealtimeSession } from "@/lib/interviews/realtime";
import { createInterviewRouteContext, loadOwnedInterview } from "@/lib/interviews/server";
import { resolveOpenAIKey } from "@/lib/openai/server";

const schema = z.object({
  interviewId: z.string().uuid(),
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

  if (interviewResult.data.mode !== "voice") {
    return NextResponse.json(
      { error: "This interview is not configured for voice." },
      { status: 400 },
    );
  }

  if (interviewResult.data.status === "closed") {
    return NextResponse.json(
      { error: "Reopen this interview before starting a voice session." },
      { status: 400 },
    );
  }

  const context = await loadInterviewContext(
    supabase,
    user.id,
    interviewResult.data.id,
  );

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveOpenAIKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildVoiceRealtimeSession(context)),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Failed to mint realtime client secret", data);
      return NextResponse.json(
        { error: "Unable to start the voice session right now." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: typeof data.value === "string" ? data.value : null,
      expiresAt: typeof data.expires_at === "number" ? data.expires_at : null,
      model: "gpt-realtime-mini",
      shouldStartOpeningTurn: context.messages.length === 0,
      interview: interviewResult.data,
    });
  } catch (error) {
    console.error("Realtime token request failed", error);
    return NextResponse.json(
      { error: "Unable to start the voice session right now." },
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
