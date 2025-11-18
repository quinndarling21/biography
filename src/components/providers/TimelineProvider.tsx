"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { Chapter } from "@/data/chapters";
import type { ChapterDraft, ManualEntryDraft } from "@/data/manual-entries";
import {
  chapterDraftToInsert,
  chapterDraftToUpdate,
  manualEntryDraftToInsert,
  manualEntryDraftToUpdate,
} from "@/data/manual-entries";
import { BiographyDataService } from "@/lib/services/biography-data-service";
import type {
  ChapterEntry,
  ServiceError,
  ServiceResult,
  TimelineChapter,
  UserChapter,
} from "@/lib/services/biography-data-service";
import { mapTimelineToChapters } from "@/lib/timeline/transformers";

import { useAuth } from "./AuthProvider";
import { useSupabase } from "./SupabaseProvider";

type TimelineContextValue = {
  timeline: TimelineChapter[];
  chapters: Chapter[];
  userChapters: UserChapter[];
  refreshTimeline: () => Promise<void>;
  refreshing: boolean;
  mutating: boolean;
  createChapter: (draft: ChapterDraft) => Promise<ServiceResult<UserChapter>>;
  updateChapter: (
    chapterId: string,
    draft: ChapterDraft,
  ) => Promise<ServiceResult<UserChapter>>;
  deleteChapter: (chapterId: string) => Promise<ServiceResult<UserChapter | null>>;
  createManualEntry: (
    draft: ManualEntryDraft,
  ) => Promise<ServiceResult<ChapterEntry>>;
  updateManualEntry: (
    entryId: string,
    draft: ManualEntryDraft,
  ) => Promise<ServiceResult<ChapterEntry>>;
  archiveManualEntry: (
    entryId: string,
  ) => Promise<ServiceResult<ChapterEntry>>;
};

const TimelineContext = createContext<TimelineContextValue | undefined>(
  undefined,
);

type TimelineProviderProps = {
  children: ReactNode;
  initialTimeline: TimelineChapter[];
};

export function TimelineProvider({
  children,
  initialTimeline,
}: TimelineProviderProps) {
  const supabase = useSupabase();
  const { user } = useAuth();
  const [timeline, setTimeline] = useState<TimelineChapter[]>(initialTimeline);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);

  const dataService = useMemo(
    () => new BiographyDataService(supabase),
    [supabase],
  );

  const refreshTimeline = useCallback(async () => {
    if (!user) {
      setTimeline([]);
      return;
    }
    setRefreshing(true);
    const { data, error } = await dataService.getTimeline(user.id);
    if (error) {
      console.error("Failed to refresh timeline", error);
    }
    if (data) {
      setTimeline(data);
    }
    setRefreshing(false);
  }, [user, dataService]);

  const chapters = useMemo(() => mapTimelineToChapters(timeline), [timeline]);
  const userChapters = useMemo(
    () => timeline.map((item) => item.chapter),
    [timeline],
  );

  const runMutation = useCallback(
    async <T,>(executor: () => Promise<ServiceResult<T>>) => {
      setMutating(true);
      const result = await executor();
      setMutating(false);
      if (!result.error) {
        await refreshTimeline();
      }
      return result;
    },
    [refreshTimeline],
  );

  const ensureUser = useCallback(
    (context: string): ServiceError | null => {
      if (!user) {
        return {
          message: "User session required",
          context,
        };
      }
      return null;
    },
    [user],
  );

  const createChapter = useCallback(
    async (draft: ChapterDraft) => {
      const blocked = ensureUser("create chapter");
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() =>
        dataService.createChapter(chapterDraftToInsert(user!.id, draft)),
      );
    },
    [dataService, ensureUser, runMutation, user],
  );

  const updateChapter = useCallback(
    async (chapterId: string, draft: ChapterDraft) => {
      const blocked = ensureUser(`update chapter ${chapterId}`);
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() =>
        dataService.updateChapter(chapterId, chapterDraftToUpdate(draft)),
      );
    },
    [dataService, ensureUser, runMutation],
  );

  const deleteChapter = useCallback(
    async (chapterId: string) => {
      const blocked = ensureUser(`delete chapter ${chapterId}`);
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() => dataService.deleteChapter(chapterId));
    },
    [dataService, ensureUser, runMutation],
  );

  const createManualEntry = useCallback(
    async (draft: ManualEntryDraft) => {
      const blocked = ensureUser(`create ${draft.type}`);
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() =>
        dataService.createChapterEntry(manualEntryDraftToInsert(draft)),
      );
    },
    [dataService, ensureUser, runMutation],
  );

  const updateManualEntry = useCallback(
    async (entryId: string, draft: ManualEntryDraft) => {
      const blocked = ensureUser(`update ${draft.type}`);
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() =>
        dataService.updateChapterEntry(entryId, manualEntryDraftToUpdate(draft)),
      );
    },
    [dataService, ensureUser, runMutation],
  );

  const archiveManualEntry = useCallback(
    async (entryId: string) => {
      const blocked = ensureUser(`archive entry ${entryId}`);
      if (blocked) {
        return { data: null, error: blocked };
      }
      return runMutation(() =>
        dataService.updateChapterEntry(entryId, { status: "archived" }),
      );
    },
    [dataService, ensureUser, runMutation],
  );

  const value = useMemo(
    () => ({
      timeline,
      chapters,
      userChapters,
      refreshTimeline,
      refreshing,
      mutating,
      createChapter,
      updateChapter,
      deleteChapter,
      createManualEntry,
      updateManualEntry,
      archiveManualEntry,
    }),
    [
      timeline,
      chapters,
      userChapters,
      refreshTimeline,
      refreshing,
      mutating,
      createChapter,
      updateChapter,
      deleteChapter,
      createManualEntry,
      updateManualEntry,
      archiveManualEntry,
    ],
  );

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimeline must be used within <TimelineProvider />");
  }
  return context;
}
