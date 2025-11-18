import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];

export type UserProfile = Tables["users"]["Row"];
type UserProfileInsert = Tables["users"]["Insert"];

export type UserChapter = Tables["user_chapters"]["Row"];
export type UserChapterInsert = Tables["user_chapters"]["Insert"];
export type UserChapterUpdate = Tables["user_chapters"]["Update"];

export type ChapterEntry = Tables["chapter_entries"]["Row"];
export type ChapterEntryInsert = Tables["chapter_entries"]["Insert"];
export type ChapterEntryUpdate = Tables["chapter_entries"]["Update"];

export type ChapterEntryType =
  Database["public"]["Enums"]["chapter_entry_type"];

export type ChapterEntryStatus =
  Database["public"]["Enums"]["chapter_entry_status"];

export type ChapterEntryDateGranularity =
  Database["public"]["Enums"]["chapter_entry_date_granularity"];

export type ChapterEntryFilter = {
  entryType?: ChapterEntryType;
  status?: ChapterEntryStatus;
  limit?: number;
};

export type ServiceError = {
  message: string;
  context: string;
  details?: string;
  hint?: string;
};

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: ServiceError };

export type TimelineChapter = {
  chapter: UserChapter;
  entries: ChapterEntry[];
};

type MaybeResult<T> = PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

type ListResult<T> = PromiseLike<{
  data: T[] | null;
  error: PostgrestError | null;
}>;

export class BiographyDataService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  // Users -------------------------------------------------------------------

  async getUserProfile(userId: string): Promise<ServiceResult<UserProfile | null>> {
    return this.resolveMaybe(
      () =>
        this.client
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle(),
      `load user profile ${userId}`,
    );
  }

  async ensureUserProfile(
    userId: string,
    attributes: Partial<Omit<UserProfileInsert, "id">> = {},
  ): Promise<ServiceResult<UserProfile>> {
    return this.resolveRequired(
      () =>
        this.client
          .from("users")
          .upsert(
            {
              id: userId,
              ...attributes,
            },
              { onConflict: "id" },
          )
          .select("*")
          .single(),
      `ensure user profile ${userId}`,
    );
  }

  // Chapters -----------------------------------------------------------------

  async listChapters(userId: string): Promise<ServiceResult<UserChapter[]>> {
    return this.resolveList(
      () =>
        this.client
          .from("user_chapters")
          .select("*")
          .eq("user_id", userId)
          .order("start_date", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
      `list chapters for ${userId}`,
    );
  }

  async getTimeline(userId: string): Promise<ServiceResult<TimelineChapter[]>> {
    try {
      const { data, error } = await this.client
        .from("user_chapters")
        .select("*, chapter_entries(*)")
        .eq("user_id", userId)
        .order("start_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (error) {
        return { data: null, error: buildError(`timeline for ${userId}`, error) };
      }

      type ChapterWithEntries = UserChapter & {
        chapter_entries?: ChapterEntry[] | null;
      };

      const timeline: TimelineChapter[] = (data ?? []).map((chapterData) => {
        const { chapter_entries, ...rest } = chapterData as ChapterWithEntries;
        const filteredEntries = (chapter_entries ?? []).filter(
          (entry) => entry.status !== "archived",
        );
        const sortedEntries = [...filteredEntries].sort((a, b) => {
          const dateA = a.entry_date ? Date.parse(a.entry_date) : Number.NEGATIVE_INFINITY;
          const dateB = b.entry_date ? Date.parse(b.entry_date) : Number.NEGATIVE_INFINITY;
          if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
            return dateB - dateA;
          }
          if (Number.isFinite(dateA) && !Number.isFinite(dateB)) {
            return -1;
          }
          if (!Number.isFinite(dateA) && Number.isFinite(dateB)) {
            return 1;
          }
          const createdA = Date.parse(a.created_at);
          const createdB = Date.parse(b.created_at);
          return createdB - createdA;
        });

        return {
          chapter: rest,
          entries: sortedEntries,
        };
      });

      return { data: timeline, error: null };
    } catch (unknownError) {
      return {
        data: null,
        error: buildError(
          `timeline for ${userId}`,
          unknownError instanceof Error
            ? unknownError
            : new Error("Unknown Supabase error"),
        ),
      };
    }
  }

  async getChapter(chapterId: string): Promise<ServiceResult<UserChapter | null>> {
    return this.resolveMaybe(
      () =>
        this.client
          .from("user_chapters")
          .select("*")
          .eq("id", chapterId)
          .maybeSingle(),
      `load chapter ${chapterId}`,
    );
  }

  async createChapter(
    payload: UserChapterInsert,
  ): Promise<ServiceResult<UserChapter>> {
    return this.resolveRequired(
      () =>
        this.client.from("user_chapters").insert(payload).select("*").single(),
      "create chapter",
    );
  }

  async updateChapter(
    chapterId: string,
    changes: UserChapterUpdate,
  ): Promise<ServiceResult<UserChapter>> {
    return this.resolveRequired(
      () =>
        this.client
          .from("user_chapters")
          .update(changes)
          .eq("id", chapterId)
          .select("*")
          .single(),
      `update chapter ${chapterId}`,
    );
  }

  async deleteChapter(
    chapterId: string,
  ): Promise<ServiceResult<UserChapter | null>> {
    return this.resolveMaybe(
      () =>
        this.client
          .from("user_chapters")
          .delete()
          .eq("id", chapterId)
          .select("*")
          .maybeSingle(),
      `delete chapter ${chapterId}`,
    );
  }

  // Entries ------------------------------------------------------------------

  async listChapterEntries(
    chapterId: string,
    filter: ChapterEntryFilter = {},
  ): Promise<ServiceResult<ChapterEntry[]>> {
    return this.resolveList(
      () => {
        let query = this.client
          .from("chapter_entries")
          .select("*")
          .eq("chapter_id", chapterId)
          .order("entry_date", { ascending: false, nullsFirst: true })
          .order("created_at", { ascending: false });

        if (filter.entryType) {
          query = query.eq("entry_type", filter.entryType);
        }

        if (filter.status) {
          query = query.eq("status", filter.status);
        }

        if (typeof filter.limit === "number") {
          query = query.limit(filter.limit);
        }

        return query;
      },
      `list entries for chapter ${chapterId}`,
    );
  }

  async getChapterEntry(
    entryId: string,
  ): Promise<ServiceResult<ChapterEntry | null>> {
    return this.resolveMaybe(
      () =>
        this.client
          .from("chapter_entries")
          .select("*")
          .eq("id", entryId)
          .maybeSingle(),
      `load chapter entry ${entryId}`,
    );
  }

  async createChapterEntry(
    payload: ChapterEntryInsert,
  ): Promise<ServiceResult<ChapterEntry>> {
    return this.resolveRequired(
      () =>
        this.client.from("chapter_entries").insert(payload).select("*").single(),
      "create chapter entry",
    );
  }

  async updateChapterEntry(
    entryId: string,
    changes: ChapterEntryUpdate,
  ): Promise<ServiceResult<ChapterEntry>> {
    return this.resolveRequired(
      () =>
        this.client
          .from("chapter_entries")
          .update(changes)
          .eq("id", entryId)
          .select("*")
          .single(),
      `update chapter entry ${entryId}`,
    );
  }

  async deleteChapterEntry(
    entryId: string,
  ): Promise<ServiceResult<ChapterEntry | null>> {
    return this.resolveMaybe(
      () =>
        this.client
          .from("chapter_entries")
          .delete()
          .eq("id", entryId)
          .select("*")
          .maybeSingle(),
      `delete chapter entry ${entryId}`,
    );
  }

  // Helpers ------------------------------------------------------------------

  private async resolveMaybe<T>(
    executor: () => MaybeResult<T>,
    context: string,
  ): Promise<ServiceResult<T | null>> {
    try {
      const { data, error } = await executor();
      if (error) {
        return { data: null, error: buildError(context, error) };
      }
      return { data, error: null };
    } catch (unknownError) {
      return {
        data: null,
        error: buildError(
          context,
          unknownError instanceof Error
            ? unknownError
            : new Error("Unknown Supabase error"),
        ),
      };
    }
  }

  private async resolveRequired<T>(
    executor: () => MaybeResult<T>,
    context: string,
  ): Promise<ServiceResult<T>> {
    const result = await this.resolveMaybe(executor, context);
    if (result.error) {
      return result;
    }
    if (!result.data) {
      return {
        data: null,
        error: buildError(context, null, "Record not found"),
      };
    }
    return { data: result.data, error: null };
  }

  private async resolveList<T>(
    executor: () => ListResult<T>,
    context: string,
  ): Promise<ServiceResult<T[]>> {
    try {
      const { data, error } = await executor();
      if (error) {
        return { data: null, error: buildError(context, error) };
      }
      return { data: data ?? [], error: null };
    } catch (unknownError) {
      return {
        data: null,
        error: buildError(
          context,
          unknownError instanceof Error
            ? unknownError
            : new Error("Unknown Supabase error"),
        ),
      };
    }
  }

}

function buildError(
  context: string,
  error: PostgrestError | Error | null,
  fallbackMessage?: string,
): ServiceError {
  if (error && "message" in error && "code" in (error as PostgrestError)) {
    const pgError = error as PostgrestError;
    return {
      message: pgError.message ?? fallbackMessage ?? "Supabase request failed",
      context,
      details: pgError.details ?? undefined,
      hint: pgError.hint ?? undefined,
    };
  }

  const message =
    (error instanceof Error && error.message) ||
    fallbackMessage ||
    "Supabase request failed";

  return { message, context };
}
