export type GalleryPeriod = "all" | "year" | "past30" | "week";

export type GalleryCaption = {
  id: string;
  content: string;
  image_url: string;
  like_count: number;
  is_common_use: boolean;
  created_at: string;
};

export type GalleryPage = { captions: GalleryCaption[]; totalCount: number };
export type GallerySearchParams = Promise<{ q?: string | string[] }>;

export const GALLERY_BATCH_SIZE = 24;
export const GALLERY_SEARCH_MAX_LENGTH = 200;
export const GALLERY_BROWSE_LIMIT = 100;

export function normalizeGallerySearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, GALLERY_SEARCH_MAX_LENGTH) : "";
}

export function gallerySearchPattern(search: string): string {
  // Treat SQL LIKE wildcards as characters in the remembered caption text.
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export function galleryHref(pathname: string, search: string): string {
  const query = normalizeGallerySearch(search);
  return query ? `${pathname}?${new URLSearchParams({ q: query })}` : pathname;
}
