"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BotMessageSquare,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Radio,
  RotateCcw,
  Volume2,
  Wrench,
} from "lucide-react";

import { ManualEntryDialog } from "@/components/builder/dialogs/ManualEntryDialog";
import { Button } from "@/components/ui/Button";
import { useSupabase } from "@/components/providers/SupabaseProvider";
import {
  chapterEntryToManualRecord,
  manualEntryDraftToUpdate,
} from "@/data/manual-entries";
import { buildVoiceOpeningResponse } from "@/lib/interviews/realtime";
import {
  formatAbsoluteDate,
  formatInterviewTitle,
} from "@/lib/interviews/utils";
import { BiographyDataService } from "@/lib/services/biography-data-service";
import {
  InterviewService,
  parseInterviewMessageMetadata,
  sortInterviewMessages,
  type InterviewEntryRecord,
  type InterviewMessage,
  type InterviewMessageEntryAction,
  type InterviewMessageMetadata,
  type InterviewRealtimeEvent,
  type InterviewRealtimeEventInput,
  type InterviewRealtimeEventOrigin,
  type UserInterview,
} from "@/lib/services/interview-service";
import type { Json } from "@/lib/supabase/types";
import { formatEntryDateLabel } from "@/lib/timeline/transformers";
import { cn } from "@/lib/utils";
import type { UserChapter } from "@/lib/services/biography-data-service";

type ConversationMap = Record<string, InterviewMessage[]>;
type EntryMap = Record<string, InterviewEntryRecord[]>;
type RealtimeEventMap = Record<string, InterviewRealtimeEvent[]>;
type ChapterEntry = NonNullable<InterviewEntryRecord["chapter_entries"]>;

type VoiceInterviewerScreenProps = {
  initialInterviews: UserInterview[];
  initialMessages: InterviewMessage[];
  initialEntries: InterviewEntryRecord[];
  initialRealtimeEvents: InterviewRealtimeEvent[];
  initialInterviewId: string | null;
  initialChapters: UserChapter[];
};

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type TurnState = "idle" | "listening" | "transcribing" | "thinking" | "tool_running" | "speaking";

type LiveVoiceEvent = {
  id: string;
  createdAt: string;
  origin: InterviewRealtimeEventOrigin;
  type: string;
  summary: string;
  payload?: Json;
};

type RealtimeToolCall = {
  callId: string;
  name: string;
  args: Record<string, Json | undefined>;
};

const MAX_ACTIVITY_ITEMS = 18;
const RESPONSE_COMMIT_GRACE_MS = 900;

export function VoiceInterviewerScreen({
  initialInterviews,
  initialMessages,
  initialEntries,
  initialRealtimeEvents,
  initialInterviewId,
  initialChapters,
}: VoiceInterviewerScreenProps) {
  const supabase = useSupabase();
  const interviewService = useMemo(
    () => new InterviewService(supabase),
    [supabase],
  );
  const dataService = useMemo(
    () => new BiographyDataService(supabase),
    [supabase],
  );

  const [interviews, setInterviews] = useState<UserInterview[]>(initialInterviews);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(
    initialInterviewId,
  );
  const [messagesByInterview, setMessagesByInterview] = useState<ConversationMap>(
    () => (initialInterviewId ? { [initialInterviewId]: initialMessages } : {}),
  );
  const [entriesByInterview, setEntriesByInterview] = useState<EntryMap>(
    () => (initialInterviewId ? { [initialInterviewId]: initialEntries } : {}),
  );
  const [eventsByInterview, setEventsByInterview] = useState<RealtimeEventMap>(
    () =>
      initialInterviewId ? { [initialInterviewId]: initialRealtimeEvents } : {},
  );
  const [creating, setCreating] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const [liveUserTranscript, setLiveUserTranscript] = useState("");
  const [liveAssistantTranscript, setLiveAssistantTranscript] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [sessionActivity, setSessionActivity] = useState<LiveVoiceEvent[]>([]);
  const [chapters] = useState<UserChapter[]>(initialChapters);
  const [entryDialogTarget, setEntryDialogTarget] = useState<
    | { entry: ChapterEntry; interviewId: string }
    | null
  >(null);
  const [entryDialogSubmitting, setEntryDialogSubmitting] = useState(false);

  const activeInterview = activeInterviewId
    ? interviews.find((interview) => interview.id === activeInterviewId) ?? null
    : null;
  const activeMessages = useMemo(
    () =>
      activeInterviewId
        ? sortInterviewMessages(messagesByInterview[activeInterviewId] ?? [])
        : [],
    [activeInterviewId, messagesByInterview],
  );
  const activeEntries = activeInterviewId
    ? entriesByInterview[activeInterviewId] ?? []
    : [];
  const activeRealtimeEvents = useMemo(
    () => (activeInterviewId ? eventsByInterview[activeInterviewId] ?? [] : []),
    [activeInterviewId, eventsByInterview],
  );
  const canTalk = Boolean(activeInterview && activeInterview.status === "in_progress");
  const entries: ChapterEntry[] = activeEntries
    .map((record) => record.chapter_entries)
    .filter((entry): entry is ChapterEntry => Boolean(entry));
  const activeEntryRecord = useMemo(
    () =>
      entryDialogTarget ? chapterEntryToManualRecord(entryDialogTarget.entry) : null,
    [entryDialogTarget],
  );
  const activityFeed = useMemo(
    () => [
      ...activeRealtimeEvents.slice(-MAX_ACTIVITY_ITEMS).map((event) => ({
        id: event.id,
        createdAt: event.created_at,
        origin: event.origin,
        type: event.type,
        summary: event.summary ?? prettifyEventType(event.type),
        payload: event.payload ?? undefined,
      })),
      ...sessionActivity,
    ].slice(-MAX_ACTIVITY_ITEMS),
    [activeRealtimeEvents, sessionActivity],
  );

  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingLogQueueRef = useRef<InterviewRealtimeEventInput[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const pendingResponseTimerRef = useRef<number | null>(null);
  const assistantTranscriptByItemRef = useRef<Map<string, string>>(new Map());
  const userTurnOrderRef = useRef<Map<string, number>>(new Map());
  const persistedUserItemIdsRef = useRef<Set<string>>(new Set());
  const persistedAssistantResponseIdsRef = useRef<Set<string>>(new Set());
  const pendingEntryActionsRef = useRef<InterviewMessageEntryAction[]>([]);
  const pendingToolCallsRef = useRef<Array<{ name: string; callId: string }>>([]);
  const disconnectAfterAssistantRef = useRef(false);
  const nextConversationOrderRef = useRef(1);
  const activeSessionInterviewIdRef = useRef<string | null>(null);
  const shouldOpenWithGreetingRef = useRef(false);

  useEffect(() => {
    const nextOrder =
      activeMessages.reduce((maxOrder, message) => {
        const order = parseInterviewMessageMetadata(message.metadata).realtime?.order;
        return typeof order === "number" && Number.isFinite(order)
          ? Math.max(maxOrder, order)
          : Math.max(maxOrder, message.sequence);
      }, 0) + 1;

    nextConversationOrderRef.current = nextOrder;
    userTurnOrderRef.current.clear();
    persistedUserItemIdsRef.current.clear();
    persistedAssistantResponseIdsRef.current.clear();
    assistantTranscriptByItemRef.current.clear();
    pendingEntryActionsRef.current = [];
    pendingToolCallsRef.current = [];
    disconnectAfterAssistantRef.current = false;
    if (pendingResponseTimerRef.current) {
      window.clearTimeout(pendingResponseTimerRef.current);
      pendingResponseTimerRef.current = null;
    }
    setSessionActivity([]);
    setLiveUserTranscript("");
    setLiveAssistantTranscript("");
  }, [activeInterviewId, activeMessages]);

  useEffect(() => {
    const container = transcriptViewportRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages, liveUserTranscript, liveAssistantTranscript, turnState]);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled;
    });
  }, [micEnabled]);

  useEffect(() => {
    return () => {
      if (pendingResponseTimerRef.current) {
        window.clearTimeout(pendingResponseTimerRef.current);
        pendingResponseTimerRef.current = null;
      }
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      cleanupMediaResources();
    };
  }, []);

  async function loadConversation(interviewId: string) {
    setLoadingConversation(true);
    const [messagesResult, entriesResult, eventsResult] = await Promise.all([
      interviewService.getMessages(interviewId),
      interviewService.getEntries(interviewId),
      interviewService.getRealtimeEvents(interviewId),
    ]);

    if (messagesResult.error) {
      setError(messagesResult.error.message);
    } else {
      setMessagesByInterview((prev) => ({
        ...prev,
        [interviewId]: messagesResult.data,
      }));
    }

    if (entriesResult.error) {
      setError(entriesResult.error.message);
    } else {
      setEntriesByInterview((prev) => ({
        ...prev,
        [interviewId]: entriesResult.data,
      }));
    }

    if (eventsResult.error) {
      setError(eventsResult.error.message);
    } else {
      setEventsByInterview((prev) => ({
        ...prev,
        [interviewId]: eventsResult.data,
      }));
    }

    setLoadingConversation(false);
  }

  async function refreshEntries(interviewId: string) {
    const result = await interviewService.getEntries(interviewId);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setEntriesByInterview((prev) => ({
      ...prev,
      [interviewId]: result.data,
    }));
  }

  async function refreshRealtimeEvents(interviewId: string) {
    const result = await interviewService.getRealtimeEvents(interviewId);
    if (result.error) {
      return;
    }

    setEventsByInterview((prev) => ({
      ...prev,
      [interviewId]: result.data,
    }));
  }

  async function handleSelectInterview(interviewId: string) {
    if (connectionStatus !== "disconnected") {
      await disconnectSession("switch_interview");
    }

    setError(null);
    setActiveInterviewId(interviewId);

    if (!messagesByInterview[interviewId]) {
      await loadConversation(interviewId);
    }
  }

  async function handleStartInterview() {
    if (creating) {
      return;
    }

    setCreating(true);
    setError(null);
    const result = await interviewService.createInterview({ mode: "voice" });
    if (result.error) {
      setError(result.error.message);
      setCreating(false);
      return;
    }

    const { interview } = result.data;
    setInterviews((prev) => [interview, ...prev]);
    setActiveInterviewId(interview.id);
    setMessagesByInterview((prev) => ({
      ...prev,
      [interview.id]: [],
    }));
    setEntriesByInterview((prev) => ({
      ...prev,
      [interview.id]: [],
    }));
    setEventsByInterview((prev) => ({
      ...prev,
      [interview.id]: [],
    }));
    setCreating(false);
    await connectSession(interview.id);
  }

  async function connectSession(interviewId: string) {
    if (connectionStatus !== "disconnected") {
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof window.RTCPeerConnection === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("This browser does not support live voice interviews.");
      return;
    }

    setError(null);
    setConnectionStatus("connecting");
    setTurnState("idle");
    appendActivity("app", "session_connecting", "Connecting to Walter.");

    try {
      const tokenResult = await interviewService.createVoiceSessionToken({
        interviewId,
      });

      if (tokenResult.error || !tokenResult.data.clientSecret) {
        setConnectionStatus("disconnected");
        setError(tokenResult.error?.message ?? "Unable to start the voice session.");
        return;
      }

      shouldOpenWithGreetingRef.current = tokenResult.data.shouldStartOpeningTurn;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = micEnabled;
      });

      const peerConnection = new RTCPeerConnection();
      const dataChannel = peerConnection.createDataChannel("oai-events");
      const remoteStream = new MediaStream();

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }

      peerConnection.ontrack = (event) => {
        event.streams[0]?.getAudioTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        void remoteAudioRef.current?.play().catch(() => undefined);
      };

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      bindDataChannel(dataChannel, interviewId);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.data.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const failure = await response.text().catch(() => "");
        throw new Error(failure || "Unable to complete the realtime handshake.");
      }

      const answer = await response.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answer,
      });

      peerConnectionRef.current = peerConnection;
      dataChannelRef.current = dataChannel;
      activeSessionInterviewIdRef.current = interviewId;
    } catch (sessionError) {
      console.error("Voice session failed", sessionError);
      setConnectionStatus("disconnected");
      setTurnState("idle");
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Unable to start the voice session.",
      );
      appendActivity("app", "session_failed", "The voice session could not start.");
      cleanupMediaResources();
    }
  }

  function bindDataChannel(channel: RTCDataChannel, interviewId: string) {
    channel.addEventListener("open", () => {
      setConnectionStatus("connected");
      setTurnState("idle");
      appendActivity("app", "session_connected", "Walter is live.");
      if (shouldOpenWithGreetingRef.current) {
        sendRealtimeEvent(buildVoiceOpeningResponse());
        shouldOpenWithGreetingRef.current = false;
        setTurnState("thinking");
        appendActivity("app", "opening_requested", "Walter is opening the interview.");
      }
    });

    channel.addEventListener("close", () => {
      setConnectionStatus("disconnected");
      setTurnState("idle");
    });

    channel.addEventListener("error", () => {
      appendActivity("app", "data_channel_error", "The voice connection reported an error.");
    });

    channel.addEventListener("message", (event) => {
      void handleRealtimeServerEvent(interviewId, event.data);
    });
  }

  async function handleRealtimeServerEvent(interviewId: string, payload: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return;
    }

    const eventType = typeof event.type === "string" ? event.type : "unknown";

    if (eventType === "input_audio_buffer.speech_started") {
      if (cancelPendingAssistantResponse()) {
        appendActivity(
          "app",
          "turn_hold_extended",
          "The user kept speaking, so Walter is holding the turn open.",
        );
      }
      setTurnState("listening");
      setLiveUserTranscript("");
      setLiveAssistantTranscript("");
      appendActivity("server", eventType, "Listening to the user.");
      return;
    }

    if (eventType === "input_audio_buffer.speech_stopped") {
      setTurnState("transcribing");
      appendActivity("server", eventType, "Speech stopped. Preparing the turn.");
      return;
    }

    if (eventType === "input_audio_buffer.committed") {
      const itemId = readString(event.item_id);
      if (itemId) {
        userTurnOrderRef.current.set(itemId, nextConversationOrderRef.current++);
      }
      setTurnState("transcribing");
      appendActivity(
        "server",
        eventType,
        "Captured the latest answer and waiting briefly to confirm the thought is finished.",
      );
      scheduleAssistantResponse("user_turn_committed");
      return;
    }

    if (eventType === "conversation.item.input_audio_transcription.delta") {
      const delta = readString(event.delta);
      if (delta) {
        setLiveUserTranscript((current) => `${current}${delta}`);
      }
      return;
    }

    if (eventType === "conversation.item.input_audio_transcription.completed") {
      await persistUserTranscript(interviewId, event);
      return;
    }

    if (eventType === "conversation.item.truncated") {
      setLiveAssistantTranscript("");
      appendActivity("server", eventType, "Walter stopped speaking after an interruption.");
      return;
    }

    if (eventType === "response.created") {
      if (turnState !== "tool_running") {
        setTurnState("thinking");
      }
      appendActivity("server", eventType, "Walter is preparing a reply.");
      return;
    }

    if (eventType === "response.output_audio_transcript.delta") {
      const delta = readString(event.delta);
      if (delta) {
        setTurnState("speaking");
        setLiveAssistantTranscript((current) => `${current}${delta}`);
      }
      return;
    }

    if (eventType === "response.output_audio_transcript.done") {
      const itemId = readString(event.item_id);
      const transcript = readString(event.transcript) ?? "";
      if (itemId) {
        assistantTranscriptByItemRef.current.set(itemId, transcript);
      }
      setLiveAssistantTranscript(transcript);
      return;
    }

    if (eventType === "response.done") {
      await handleResponseDone(interviewId, event);
      return;
    }

    if (eventType === "error") {
      appendActivity("server", eventType, "The voice session reported an error.", toJson(event));
      setError(readErrorMessage(event) ?? "The voice session reported an error.");
      return;
    }
  }

  async function persistUserTranscript(
    interviewId: string,
    event: Record<string, unknown>,
  ) {
    const itemId = readString(event.item_id);
    const transcript = (readString(event.transcript) ?? liveUserTranscript).trim();

    if (!itemId || !transcript || persistedUserItemIdsRef.current.has(itemId)) {
      setLiveUserTranscript("");
      return;
    }

    const metadata: InterviewMessageMetadata = {
      realtime: {
        source: "voice",
        itemId,
        order:
          userTurnOrderRef.current.get(itemId) ?? nextConversationOrderRef.current++,
      },
    };

    const result = await interviewService.persistVoiceMessage({
      interviewId,
      author: "user",
      body: transcript,
      metadata,
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    persistedUserItemIdsRef.current.add(itemId);
    appendConversationMessage(interviewId, result.data.message);
    if (result.data.interview) {
      updateInterview(result.data.interview);
    }
    setLiveUserTranscript("");
    appendActivity("app", "user_transcript_saved", "User transcript saved.");
  }

  async function handleResponseDone(
    interviewId: string,
    event: Record<string, unknown>,
  ) {
    const response = readRecord(event.response);
    const responseId = readString(response?.id);
    const responseStatus = readString(response?.status);
    const toolCalls = extractToolCalls(response);

    if (toolCalls.length > 0) {
      setTurnState("tool_running");
      appendActivity("app", "tool_batch_started", "Walter is updating the biography.");

      for (const toolCall of toolCalls) {
        pendingToolCallsRef.current.push({
          name: toolCall.name,
          callId: toolCall.callId,
        });

        appendActivity(
          "app",
          "tool_call_requested",
          `Running ${humanizeToolName(toolCall.name)}.`,
          toolCall.args,
        );

        const result = await interviewService.executeVoiceTool({
          interviewId,
          toolName: toolCall.name,
          callId: toolCall.callId,
          args: toolCall.args,
        });

        if (result.error) {
          setError(result.error.message);
          sendRealtimeEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: toolCall.callId,
              output: JSON.stringify({
                ok: false,
                message: result.error.message,
              }),
            },
          });
          appendActivity(
            "app",
            "tool_call_failed",
            `${humanizeToolName(toolCall.name)} failed.`,
          );
          continue;
        }

        const entryActions = createEntryActions(
          result.data.createdEntryIds,
          result.data.updatedEntryIds,
        );

        if (entryActions.length) {
          pendingEntryActionsRef.current = [
            ...pendingEntryActionsRef.current,
            ...entryActions,
          ];
          await refreshEntries(interviewId);
        }

        if (result.data.interview) {
          updateInterview(result.data.interview);
        }

        if (result.data.closedInterview) {
          disconnectAfterAssistantRef.current = true;
        }

        sendRealtimeEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: toolCall.callId,
            output: JSON.stringify(result.data.output),
          },
        });

        appendActivity(
          "app",
          "tool_call_completed",
          `${humanizeToolName(toolCall.name)} finished.`,
        );
      }

      requestAssistantResponse("tool_results_ready");
      return;
    }

    if (responseStatus && responseStatus !== "completed") {
      setTurnState("idle");
      setLiveAssistantTranscript("");
      appendActivity(
        "server",
        "response_incomplete",
        "Walter stopped before finishing the turn.",
      );
      return;
    }

    if (responseId && persistedAssistantResponseIdsRef.current.has(responseId)) {
      return;
    }

    const transcript = extractAssistantTranscript(response);
    if (!transcript) {
      setTurnState("idle");
      setLiveAssistantTranscript("");
      return;
    }

    const messageItemId = extractPrimaryMessageItemId(response);
    const metadata: InterviewMessageMetadata = {
      ...(pendingEntryActionsRef.current.length
        ? { entryActions: pendingEntryActionsRef.current }
        : {}),
      realtime: {
        source: "voice",
        responseId: responseId ?? null,
        itemId: messageItemId,
        order: nextConversationOrderRef.current++,
        stage:
          activeMessages.length === 0
            ? "opening"
            : disconnectAfterAssistantRef.current
              ? "closing"
              : "follow_up",
        ...(pendingToolCallsRef.current.length
          ? { toolCalls: pendingToolCallsRef.current }
          : {}),
      },
      ...(disconnectAfterAssistantRef.current
        ? { conversation: { ended: true } }
        : {}),
    };

    const result = await interviewService.persistVoiceMessage({
      interviewId,
      author: "interviewer",
      body: transcript,
      metadata,
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (responseId) {
      persistedAssistantResponseIdsRef.current.add(responseId);
    }

    appendConversationMessage(interviewId, result.data.message);
    if (result.data.interview) {
      updateInterview(result.data.interview);
    }

    pendingEntryActionsRef.current = [];
    pendingToolCallsRef.current = [];
    setLiveAssistantTranscript("");
    setTurnState("idle");
    appendActivity("app", "assistant_reply_saved", "Walter's reply was saved.");

    if (disconnectAfterAssistantRef.current) {
      disconnectAfterAssistantRef.current = false;
      await disconnectSession("interview_completed");
      await refreshRealtimeEvents(interviewId);
    }
  }

  function requestAssistantResponse(reason: string) {
    cancelPendingAssistantResponse();
    sendRealtimeEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        metadata: {
          reason,
        },
      },
    });
  }

  function scheduleAssistantResponse(reason: string) {
    cancelPendingAssistantResponse();
    pendingResponseTimerRef.current = window.setTimeout(() => {
      pendingResponseTimerRef.current = null;
      setTurnState("thinking");
      requestAssistantResponse(reason);
    }, RESPONSE_COMMIT_GRACE_MS);
  }

  function cancelPendingAssistantResponse() {
    if (!pendingResponseTimerRef.current) {
      return false;
    }

    window.clearTimeout(pendingResponseTimerRef.current);
    pendingResponseTimerRef.current = null;
    return true;
  }

  function sendRealtimeEvent(event: Record<string, unknown>) {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }
    channel.send(JSON.stringify(event));
  }

  function appendConversationMessage(interviewId: string, message: InterviewMessage) {
    setMessagesByInterview((prev) => ({
      ...prev,
      [interviewId]: sortInterviewMessages([...(prev[interviewId] ?? []), message]),
    }));
  }

  function updateInterview(interview: UserInterview) {
    setInterviews((prev) =>
      prev.map((current) => (current.id === interview.id ? interview : current)),
    );
  }

  function appendActivity(
    origin: InterviewRealtimeEventOrigin,
    type: string,
    summary: string,
    payload?: Json,
  ) {
    const event: LiveVoiceEvent = {
      id: buildLocalId(),
      createdAt: new Date().toISOString(),
      origin,
      type,
      summary,
      ...(payload !== undefined ? { payload } : {}),
    };

    setSessionActivity((prev) => [...prev, event].slice(-MAX_ACTIVITY_ITEMS));
    queuePersistedEvent({
      origin,
      type,
      summary,
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  function queuePersistedEvent(event: InterviewRealtimeEventInput) {
    pendingLogQueueRef.current.push(event);
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      void flushRealtimeEventQueue();
    }, 700);
  }

  async function flushRealtimeEventQueue() {
    if (!activeInterviewId || pendingLogQueueRef.current.length === 0) {
      return;
    }

    const batch = [...pendingLogQueueRef.current];
    pendingLogQueueRef.current = [];

    const result = await interviewService.logRealtimeEvents({
      interviewId: activeInterviewId,
      events: batch,
    });

    if (result.error) {
      pendingLogQueueRef.current = [...batch, ...pendingLogQueueRef.current].slice(-100);
    }
  }

  async function disconnectSession(reason: string) {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    cancelPendingAssistantResponse();

    if (
      connectionStatus === "connected" ||
      connectionStatus === "connecting"
    ) {
      appendActivity("app", "session_disconnected", "Voice session disconnected.", {
        reason,
      });
    }

    dataChannelRef.current?.close();
    peerConnectionRef.current?.close();
    cleanupMediaResources();

    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    activeSessionInterviewIdRef.current = null;
    setConnectionStatus("disconnected");
    setTurnState("idle");
    setLiveUserTranscript("");
    setLiveAssistantTranscript("");

    await flushRealtimeEventQueue();
  }

  function cleanupMediaResources() {
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
  }

  async function handleManualCloseInterview() {
    if (!activeInterviewId || closing) {
      return;
    }

    if (connectionStatus !== "disconnected") {
      await disconnectSession("manual_close");
    }

    setClosing(true);
    const result = await interviewService.closeInterview(activeInterviewId);
    if (result.error) {
      setError(result.error.message);
      setClosing(false);
      return;
    }

    updateInterview(result.data);
    setClosing(false);
  }

  async function handleReopenInterview() {
    if (!activeInterviewId || reopening) {
      return;
    }

    setReopening(true);
    const result = await interviewService.reopenInterview(activeInterviewId);
    if (result.error) {
      setError(result.error.message);
      setReopening(false);
      return;
    }

    updateInterview(result.data);
    setReopening(false);
  }

  return (
    <div className="grid min-h-[calc(100vh-140px)] grid-cols-1 gap-4 bg-[var(--color-surface-base)] p-4 text-[var(--color-text-strong)] lg:grid-cols-[280px_minmax(0,1fr)_340px]">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      <aside className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
              Voice Sessions
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Resume a spoken interview.
            </p>
          </div>
          <button
            type="button"
            aria-label="Start new voice interview"
            disabled={creating}
            onClick={() => {
              void handleStartInterview();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-subtle)] bg-white text-[var(--color-text-strong)] shadow-sm transition hover:border-[var(--color-text-strong)] disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {interviews.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-text-muted)]">
            Start your first voice interview to see it listed here.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {interviews.map((interview, index) => {
              const isActive = interview.id === activeInterviewId;
              return (
                <li key={interview.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSelectInterview(interview.id);
                    }}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      isActive
                        ? "border-[var(--color-text-strong)] bg-[var(--color-accent-highlight)]/60"
                        : "border-[var(--color-border-subtle)] bg-white hover:border-[var(--color-text-strong)]",
                    )}
                  >
                    <p className="text-sm font-semibold">
                      {formatInterviewTitle(interview, index + 1)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Started {formatAbsoluteDate(interview.created_at)}
                    </p>
                    <span
                      className={cn(
                        "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        interview.status === "in_progress"
                          ? "bg-[var(--color-accent-highlight)] text-[var(--color-text-strong)]"
                          : "bg-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
                      )}
                    >
                      {interview.status === "in_progress" ? "In progress" : "Closed"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[400px] flex-col rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
        <header className="flex flex-col gap-4 border-b border-[var(--color-border-subtle)] pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold">
                {activeInterview
                  ? formatInterviewTitle(activeInterview)
                  : "Select a voice interview"}
              </p>
              {activeInterview ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {activeInterview.status === "in_progress" ? "In progress" : "Closed"}{" "}
                  • Started {formatAbsoluteDate(activeInterview.created_at)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canTalk ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={closing}
                  onClick={() => {
                    void handleManualCloseInterview();
                  }}
                  className="text-xs"
                >
                  {closing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <PhoneOff className="h-4 w-4" aria-hidden />
                  )}
                  <span className="ml-2">End interview</span>
                </Button>
              ) : activeInterview ? (
                <Button
                  type="button"
                  size="md"
                  disabled={reopening}
                  onClick={() => {
                    void handleReopenInterview();
                  }}
                  className="text-xs"
                >
                  {reopening ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  )}
                  <span className="ml-2">Reopen interview</span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--color-border-subtle)] bg-[linear-gradient(135deg,rgba(255,246,240,0.95)_0%,rgba(245,250,255,0.95)_100%)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full border text-[var(--color-text-strong)]",
                    connectionStatus === "connected"
                      ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/20 shadow-[0_0_0_10px_rgba(167,205,211,0.18)]"
                      : connectionStatus === "connecting"
                        ? "border-[var(--color-accent-highlight)] bg-[var(--color-accent-highlight)]/40"
                        : "border-[var(--color-border-subtle)] bg-white",
                  )}
                >
                  {connectionStatus === "connecting" ? (
                    <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                  ) : micEnabled ? (
                    <Mic className="h-7 w-7" aria-hidden />
                  ) : (
                    <MicOff className="h-7 w-7" aria-hidden />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--color-text-secondary)]">
                    Voice Status
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {describeTurnState(connectionStatus, turnState)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {describeTurnHint(connectionStatus, turnState)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={!activeInterviewId || !canTalk || connectionStatus === "connecting"}
                  onClick={() => {
                    if (connectionStatus === "disconnected" && activeInterviewId) {
                      void connectSession(activeInterviewId);
                      return;
                    }

                    void disconnectSession("manual_disconnect");
                  }}
                  className="text-xs"
                >
                  {connectionStatus === "connected" ? (
                    <PhoneOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Radio className="h-4 w-4" aria-hidden />
                  )}
                  <span className="ml-2">
                    {connectionStatus === "connected" ? "Disconnect" : "Connect"}
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={connectionStatus === "disconnected"}
                  onClick={() => {
                    setMicEnabled((current) => !current);
                  }}
                  className="text-xs"
                >
                  {micEnabled ? (
                    <MicOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden />
                  )}
                  <span className="ml-2">{micEnabled ? "Mute mic" : "Unmute mic"}</span>
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {[
                { key: "listening", label: "Listening", icon: Mic },
                { key: "thinking", label: "Thinking", icon: BotMessageSquare },
                { key: "tool_running", label: "Saving", icon: Wrench },
                { key: "speaking", label: "Speaking", icon: Volume2 },
              ].map((step) => {
                const Icon = step.icon;
                const active =
                  (step.key === "thinking" &&
                    (turnState === "thinking" || turnState === "transcribing")) ||
                  turnState === step.key;

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                      active
                        ? "border-[var(--color-text-strong)] bg-white text-[var(--color-text-strong)]"
                        : "border-[var(--color-border-subtle)] bg-white/70 text-[var(--color-text-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="font-medium">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div
          ref={transcriptViewportRef}
          className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-3xl border border-[var(--color-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,241,235,0.78)_100%)] p-4"
        >
          {loadingConversation ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading interview...
            </div>
          ) : !activeInterview ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Select a voice interview from the left or start a new one.
            </p>
          ) : activeMessages.length === 0 &&
            !liveUserTranscript &&
            !liveAssistantTranscript ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Connect to Walter to begin the interview.
            </p>
          ) : (
            <>
              {activeMessages.map((message) => (
                <VoiceTranscriptBubble
                  key={`${message.id}-${message.sequence}`}
                  message={message}
                />
              ))}
              {connectionStatus === "connected" && turnState === "listening" && !liveUserTranscript ? (
                <LiveTranscriptBubble
                  speaker="user"
                  label="Listening..."
                  body="Say the next memory, milestone, or story."
                />
              ) : null}
              {liveUserTranscript ? (
                <LiveTranscriptBubble
                  speaker="user"
                  label="You"
                  body={liveUserTranscript}
                />
              ) : null}
              {turnState === "thinking" || turnState === "tool_running" ? (
                <LiveTranscriptBubble
                  speaker="assistant"
                  label={turnState === "tool_running" ? "Saving details..." : "Thinking..."}
                  body={
                    turnState === "tool_running"
                      ? "Walter is updating your timeline before speaking."
                      : "Walter is preparing the next question."
                  }
                />
              ) : null}
              {liveAssistantTranscript ? (
                <LiveTranscriptBubble
                  speaker="assistant"
                  label="Walter"
                  body={liveAssistantTranscript}
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
                Live Activity
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Follow what the agent is doing in real time.
              </p>
            </div>
            <span className="rounded-full bg-[var(--color-accent-highlight)]/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              {connectionStatus}
            </span>
          </div>

          {activityFeed.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--color-text-muted)]">
              Connection events, saves, and tool activity will appear here.
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {activityFeed
                .slice()
                .reverse()
                .map((event) => (
                  <li
                    key={event.id}
                    className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/70 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--color-text-strong)]">
                          {event.summary}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                          {prettifyEventOrigin(event.origin)} • {formatActivityTime(event.createdAt)}
                        </p>
                      </div>
                      {renderEventIcon(event.type)}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--color-border-subtle)] bg-white/95 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            Entries Captured
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Memories Walter has already drafted from the call.
          </p>

          {entries.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--color-text-muted)]">
              Draft entries will appear here as the interview progresses.
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {entries.map((entry) => {
                const statusLabel = entry.status === "published" ? "Published" : "Draft";
                const statusStyles =
                  entry.status === "published"
                    ? "bg-[var(--color-accent-primary)]/30 text-[var(--color-text-strong)]"
                    : "bg-[var(--color-accent-highlight)]/50 text-[var(--color-text-strong)]";

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeInterviewId) {
                          return;
                        }
                        setEntryDialogTarget({ entry, interviewId: activeInterviewId });
                      }}
                      className="w-full rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]/70 p-4 text-left transition hover:border-[var(--color-text-strong)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text-strong)]">
                            {entry.title}
                          </p>
                          {entry.entry_date ? (
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {formatEntryDateLabel(
                                entry.entry_date,
                                entry.date_granularity,
                              )}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                            statusStyles,
                          )}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      {entry.summary ? (
                        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                          {entry.summary}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <ManualEntryDialog
        key={activeEntryRecord?.id ?? "voice-entry"}
        open={Boolean(entryDialogTarget && activeEntryRecord)}
        mode="edit"
        initialEntry={activeEntryRecord ?? undefined}
        chapters={chapters}
        submitting={entryDialogSubmitting}
        onClose={() => setEntryDialogTarget(null)}
        onSubmit={async (draft) => {
          if (!entryDialogTarget) {
            return {
              data: null,
              error: {
                context: "update voice entry",
                message: "Select an entry to update.",
              },
            };
          }

          setEntryDialogSubmitting(true);
          const result = await dataService.updateChapterEntry(
            entryDialogTarget.entry.id,
            manualEntryDraftToUpdate(draft),
          );
          setEntryDialogSubmitting(false);

          if (!result.error) {
            await refreshEntries(entryDialogTarget.interviewId);
            setEntryDialogTarget(null);
          }

          return result;
        }}
        entryType={activeEntryRecord?.type}
      />
    </div>
  );
}

function VoiceTranscriptBubble({ message }: { message: InterviewMessage }) {
  const isUser = message.author === "user";
  const metadata = parseInterviewMessageMetadata(message.metadata);

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser
            ? "bg-[var(--color-text-strong)] text-on-strong"
            : "bg-white text-[var(--color-text-strong)]",
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">
          {isUser ? "You" : "Walter"}
          {metadata.realtime?.stage ? (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px]">
              {metadata.realtime.stage}
            </span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.body}
        </p>
      </div>
    </div>
  );
}

function LiveTranscriptBubble({
  speaker,
  label,
  body,
}: {
  speaker: "user" | "assistant";
  label: string;
  body: string;
}) {
  const isUser = speaker === "user";

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl border border-dashed px-4 py-3 text-sm shadow-sm",
          isUser
            ? "border-[var(--color-text-strong)]/30 bg-[var(--color-text-strong)]/10 text-[var(--color-text-strong)]"
            : "border-[var(--color-border-subtle)] bg-white/80 text-[var(--color-text-strong)]",
        )}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function createEntryActions(createdEntryIds: string[], updatedEntryIds: string[]) {
  return [
    ...createdEntryIds.map((entryId) => ({
      action: "created" as const,
      entryId,
    })),
    ...updatedEntryIds.map((entryId) => ({
      action: "updated" as const,
      entryId,
    })),
  ];
}

function extractToolCalls(response: Record<string, unknown> | null) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap((item) => {
    const record = readRecord(item);
    if (!record || record.type !== "function_call") {
      return [];
    }

    return [
      {
        callId: readString(record.call_id) ?? readString(record.id) ?? buildLocalId(),
        name: readString(record.name) ?? "unknown_tool",
        args: parseToolArguments(record.arguments),
      } satisfies RealtimeToolCall,
    ];
  });
}

function extractAssistantTranscript(response: Record<string, unknown> | null) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const segments = output.flatMap((item) => {
    const record = readRecord(item);
    if (!record || record.type !== "message") {
      return [];
    }

    const itemId = readString(record.id);
    if (itemId) {
      const firstContent = Array.isArray(record.content) ? record.content[0] : null;
      const transcript = readString(
        readRecord(firstContent)?.transcript,
      );
      if (transcript) {
        return [transcript];
      }
    }

    const content = Array.isArray(record.content) ? record.content : [];
    return content.flatMap((contentPart) => {
      const contentRecord = readRecord(contentPart);
      if (!contentRecord) {
        return [];
      }

      const transcript = readString(contentRecord.transcript);
      const text = readString(contentRecord.text);
      return [transcript ?? text].filter(Boolean) as string[];
    });
  });

  return segments.join("\n").trim();
}

function extractPrimaryMessageItemId(response: Record<string, unknown> | null) {
  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    const record = readRecord(item);
    if (record?.type === "message") {
      return readString(record.id) ?? null;
    }
  }
  return null;
}

function parseToolArguments(value: unknown): Record<string, Json | undefined> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, Json | undefined>)
        : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function describeTurnState(connectionStatus: ConnectionStatus, turnState: TurnState) {
  if (connectionStatus === "connecting") {
    return "Connecting";
  }

  if (connectionStatus === "disconnected") {
    return "Offline";
  }

  switch (turnState) {
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "thinking":
      return "Thinking";
    case "tool_running":
      return "Saving details";
    case "speaking":
      return "Speaking";
    default:
      return "Ready";
  }
}

function describeTurnHint(connectionStatus: ConnectionStatus, turnState: TurnState) {
  if (connectionStatus === "connecting") {
    return "Setting up the microphone and realtime connection.";
  }

  if (connectionStatus === "disconnected") {
    return "Connect when you are ready to speak.";
  }

  switch (turnState) {
    case "listening":
      return "Walter is waiting for the next story beat.";
    case "transcribing":
      return "Walter is finishing transcription and holding for a beat in case you keep going.";
    case "thinking":
      return "Walter is deciding on the next follow-up.";
    case "tool_running":
      return "The interview is saving new details into your timeline.";
    case "speaking":
      return "Walter is responding aloud.";
    default:
      return "The session is live and ready for the next answer.";
  }
}

function renderEventIcon(type: string) {
  if (type.includes("tool")) {
    return <Wrench className="h-4 w-4 text-[var(--color-text-secondary)]" aria-hidden />;
  }

  if (type.includes("saved") || type.includes("completed")) {
    return (
      <CheckCircle2
        className="h-4 w-4 text-[var(--color-accent-primary)]"
        aria-hidden
      />
    );
  }

  return <Radio className="h-4 w-4 text-[var(--color-text-secondary)]" aria-hidden />;
}

function prettifyEventOrigin(origin: InterviewRealtimeEventOrigin) {
  if (origin === "app") {
    return "App";
  }

  if (origin === "server") {
    return "Realtime";
  }

  return "Client";
}

function prettifyEventType(type: string) {
  return type
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function humanizeToolName(name: string) {
  return name.replaceAll("_", " ");
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readErrorMessage(event: Record<string, unknown>) {
  const error = readRecord(event.error);
  return readString(error?.message);
}

function toJson(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toJson(entry))
      .filter((entry): entry is Json => entry !== undefined);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const normalized = toJson(entry);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
    ) as Json;
  }

  return undefined;
}

function buildLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
