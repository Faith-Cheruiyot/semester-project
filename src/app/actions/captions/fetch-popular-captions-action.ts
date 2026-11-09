"use server";

import { createClient } from "@/utils/supabase/server";
import {
  GALLERY_BATCH_SIZE,
  GALLERY_BROWSE_LIMIT,
  gallerySearchPattern,
  normalizeGallerySearch,
  type GalleryPage,
  type GalleryPeriod,
} from "@/lib/caption-gallery";

type Row = {
  id: string;
  content: string | null;
  created_datetime_utc: string;
  like_count: number | null;
  images: { url: string | null; is_common_use: boolean | null } | null;
};

export async function fetchCaptionGalleryPageAction({
  period = "all",
  search = "",
  offset = 0,
  limit = GALLERY_BATCH_SIZE,
}: {
  period?: GalleryPeriod;
  search?: string;
  offset?: number;
  limit?: number;
} = {}): Promise<GalleryPage> {
  if (
    !["all", "year", "past30", "week"].includes(period) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error("Invalid gallery request.");
  }

  const term = normalizeGallerySearch(search);
  const supabase = await createClient();
  let query = supabase
    .from("captions")
    .select(
      `
    id, content, created_datetime_utc, like_count,
    images!inner (url, is_common_use, is_public)
  `,
      { count: "exact" },
    )
    .eq("images.is_public", true)
    .eq("is_public", true)
    .gt("like_count", 0)
    .order("like_count", { ascending: false })
    .order("created_datetime_utc", { ascending: false })
    .order("id", { ascending: true });

  if (term) query = query.ilike("content", gallerySearchPattern(term));
  if (period !== "all") {
    const since = new Date();
    if (period === "year") since.setFullYear(since.getFullYear() - 1);
    else since.setDate(since.getDate() - (period === "past30" ? 30 : 7));
    query = query.gte("created_datetime_utc", since.toISOString());
  }

  // Ordinary browsing remains Top 100. Search runs over all eligible captions
  // before pagination, so a remembered joke need not be in that original 100.
  const remaining = term ? limit : Math.min(limit, Math.max(0, GALLERY_BROWSE_LIMIT - offset));
  const { data, count, error } = await query
    .range(remaining ? offset : 0, remaining ? offset + remaining - 1 : 0)
    .returns<Row[]>();
  if (error) {
    console.error("Error fetching caption gallery:", error.message);
    throw new Error("Unable to load captions. Please try again.");
  }

  return {
    captions: remaining
      ? (data ?? []).map((row) => ({
          id: row.id,
          content: row.content ?? "",
          image_url: row.images?.url ?? "",
          like_count: row.like_count ?? 0,
          is_common_use: row.images?.is_common_use ?? false,
          created_at: row.created_datetime_utc,
        }))
      : [],
    totalCount: term ? (count ?? 0) : Math.min(count ?? 0, GALLERY_BROWSE_LIMIT),
  };
}

export async function fetchPopularCaptionsAction(limit = 100, period: GalleryPeriod = "all") {
  return (await fetchCaptionGalleryPageAction({ limit, period })).captions;
}
