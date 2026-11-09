"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  fetchCaptionGalleryPageAction,
} from "@/app/actions/captions/fetch-popular-captions-action";
import {
  toggleCaptionVoteAction,
  fetchUserCaptionVotesAction,
  insertSaveAction,
  deleteSaveAction,
  fetchSavedCaptionsAction,
} from "@/app/actions/captions";
import { useToast } from "@/hooks/use-toast";
import ShareModal from "@/components/share-modal";
import { CaptionGridSkeleton } from "@/components/ui/image-grid-skeleton";
import { usePathname, useRouter } from "next/navigation";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import Link from "next/link";
import { ChevronUp, ChevronDown, Search, X, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  GALLERY_BATCH_SIZE,
  GALLERY_SEARCH_MAX_LENGTH,
  galleryHref,
  normalizeGallerySearch,
  type GalleryCaption,
  type GalleryPeriod,
} from "@/lib/caption-gallery";
import { TOP_100_FILTER_HREFS } from "@/lib/top-100";
import { buildCaptionShareUrl } from "@/utils/site-url";
import { BrandImage } from "@/components/brand-image";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CaptionModal } from "@/components/ui/caption-modal";
import { BookmarkButton } from "@/components/ui/bookmark-button";
import { Top100CaptionImage } from "@/components/top-100-caption-image";

// functions to load in our pregenrated thumbnails
const THUMBNAIL_SIZES = [320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;

const parseImageUrl = (url: string) => {
  // expects: https://images.domain.com/<userId>/<imageId>.<ext>
  const match = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)/);
  if (match) {
    const [, userId, imageId, extension] = match;
    return { userId, imageId, extension };
  }
  return null;
};

const generateThumbnailUrls = (
  baseUrl: string,
  userId: string,
  imageId: string,
  extension: string,
) => {
  const basePath = `${baseUrl}/${userId}/${imageId}`;
  return {
    original: `${basePath}.${extension}`,
    srcSet: THUMBNAIL_SIZES.map((size) => `${basePath}-${size}.${extension} ${size}w`).join(", "),
    gridUrl: `${basePath}-${THUMBNAIL_SIZES.find((s) => s >= 640) || 640}.${extension}`,
    blurUrl: `${basePath}-640.${extension}`,
  };
};

type PopularCaption = GalleryCaption;
type PopularCaptionsFilter = GalleryPeriod;

interface PopularCaptionsPageClientProps {
  initialFilter?: PopularCaptionsFilter;
  pastWeekHref?: string;
  pastMonthHref?: string;
  pastYearHref?: string;
  allTimeHref?: string;
  initialCaptions?: PopularCaption[];
  initialUserVotes?: Record<string, 1 | -1 | null>;
  initialIsAuthenticated?: boolean;
  initialSearch?: string;
  initialTotalCount?: number;
  initialError?: string;
}

const filterOptions: Array<{ key: PopularCaptionsFilter; label: string }> = [
  { key: "week", label: "Past Week" },
  { key: "past30", label: "Past Month" },
  { key: "year", label: "Past Year" },
  { key: "all", label: "All Time" },
];

export default function PopularCaptionsPageClient({
  initialFilter = "week",
  pastWeekHref = TOP_100_FILTER_HREFS.pastWeekHref,
  pastMonthHref = TOP_100_FILTER_HREFS.pastMonthHref,
  pastYearHref = TOP_100_FILTER_HREFS.pastYearHref,
  allTimeHref = TOP_100_FILTER_HREFS.allTimeHref,
  initialCaptions = [],
  initialUserVotes = {},
  initialIsAuthenticated = false,
  initialSearch = "",
  initialTotalCount = initialCaptions.length,
  initialError = "",
}: PopularCaptionsPageClientProps) {
  const [popularCaptions, setPopularCaptions] = useState<PopularCaption[]>(initialCaptions);
  const [userVotes, setUserVotes] = useState<Record<string, 1 | -1 | null>>(initialUserVotes);
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const loadRequest = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [visibleCount, setVisibleCount] = useState(8);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = initialIsAuthenticated;
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [savedCaptions, setSavedCaptions] = useState<string[]>([]);
  const filter = initialFilter;
  const isLoading = isPending || isNavigating;
  const filterHrefs: Record<PopularCaptionsFilter, string> = {
    week: pastWeekHref,
    past30: pastMonthHref,
    year: pastYearHref,
    all: allTimeHref,
  };

  useEffect(
    () => () => {
      loadRequest.current += 1;
    },
    [],
  );

  useEffect(() => {
    const fetchSavedCaptions = async () => {
      if (!isAuthenticated) {
        setSavedCaptions([]);
        return;
      }

      try {
        const saved = await fetchSavedCaptionsAction();
        setSavedCaptions(saved.map((caption) => caption.id));
      } catch (error) {
        console.error("Error fetching saved captions:", error);
        setSavedCaptions([]);
      }
    };

    fetchSavedCaptions();
  }, [isAuthenticated]);

  const handleVote = async (captionId: string, voteValue: 1 | -1) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const currentVote = userVotes[captionId] ?? null;
    const originalVote = currentVote;
    const originalCount = popularCaptions.find((c) => c.id === captionId)?.like_count || 0;

    // Optimistic update: determine new vote value
    let newVoteValue: 1 | -1 | null;
    if (currentVote === voteValue) {
      // If clicking the same vote, remove it
      newVoteValue = null;
    } else {
      // Otherwise, set the new vote
      newVoteValue = voteValue;
    }

    // Calculate optimistic count change
    let countChange = 0;
    if (originalVote === 1 && newVoteValue === null) {
      countChange = -1; // Removing upvote
    } else if (originalVote === -1 && newVoteValue === null) {
      countChange = 1; // Removing downvote
    } else if (originalVote === null && newVoteValue === 1) {
      countChange = 1; // Adding upvote
    } else if (originalVote === null && newVoteValue === -1) {
      countChange = -1; // Adding downvote
    } else if (originalVote === 1 && newVoteValue === -1) {
      countChange = -2; // Switching from upvote to downvote
    } else if (originalVote === -1 && newVoteValue === 1) {
      countChange = 2; // Switching from downvote to upvote
    }

    // Optimistic UI update
    setUserVotes((prev) => ({
      ...prev,
      [captionId]: newVoteValue,
    }));

    setPopularCaptions((prev) =>
      prev.map((caption) =>
        caption.id === captionId
          ? { ...caption, like_count: caption.like_count + countChange }
          : caption,
      ),
    );

    try {
      await toggleCaptionVoteAction(captionId, voteValue);
    } catch (error) {
      console.error("Error updating vote:", error);
      // Revert optimistic update
      setUserVotes((prev) => ({
        ...prev,
        [captionId]: originalVote,
      }));
      setPopularCaptions((prev) =>
        prev.map((caption) =>
          caption.id === captionId ? { ...caption, like_count: originalCount } : caption,
        ),
      );
      toast({
        title: "Error",
        description: "Failed to update vote",
      });
    }
  };

  const handleSlideSave = async (captionId: string) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const originalState = savedCaptions;
    const isSaved = savedCaptions.includes(captionId);

    try {
      if (isSaved) {
        setSavedCaptions((prev) => prev.filter((id) => id !== captionId));
        await deleteSaveAction(captionId);
      } else {
        setSavedCaptions((prev) => [...prev, captionId]);
        await insertSaveAction(captionId);
      }
    } catch (error) {
      console.error("Error saving/unsaving caption:", error);
      setSavedCaptions(originalState);
      toast({
        title: "Error",
        description: "Failed to update favorite.",
      });
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleCloseCarousel = () => {
    setSelectedIndex(null);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedIndex !== null) {
        handleCloseCarousel();
      }
    };

    const handleArrowKeys = (event: KeyboardEvent) => {
      if (selectedIndex === null || popularCaptions.length === 0) return;

      if (event.key === "ArrowLeft") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? popularCaptions.length - 1 : prev - 1;
        });
      } else if (event.key === "ArrowRight") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === popularCaptions.length - 1 ? 0 : prev + 1;
        });
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleArrowKeys);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleArrowKeys);
    };
  }, [selectedIndex, popularCaptions.length]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = normalizeGallerySearch(searchInput);
    setSearchInput(search);
    if (search === initialSearch) return;
    startTransition(() => router.push(galleryHref(pathname, search), { scroll: false }));
  };

  const clearSearch = () => {
    setSearchInput("");
    if (!initialSearch) return;
    startTransition(() => router.push(pathname, { scroll: false }));
  };

  const loadMore = async () => {
    if (isLoadingMore || isLoading) return;
    const nextVisible = Math.min(visibleCount + itemsPerPage, totalCount);
    if (nextVisible <= popularCaptions.length) {
      setVisibleCount(nextVisible);
      return;
    }
    const request = ++loadRequest.current;
    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const page = await fetchCaptionGalleryPageAction({
        period: filter,
        search: initialSearch,
        offset: popularCaptions.length,
        limit: GALLERY_BATCH_SIZE,
      });
      if (request !== loadRequest.current) return;
      setPopularCaptions((previous) => {
        const ids = new Set(previous.map((caption) => caption.id));
        return [...previous, ...page.captions.filter((caption) => !ids.has(caption.id))];
      });
      setTotalCount(page.totalCount);
      setVisibleCount(nextVisible);
      if (isAuthenticated && page.captions.length) {
        try {
          const votes = await fetchUserCaptionVotesAction(
            page.captions.map((caption) => caption.id),
          );
          if (request === loadRequest.current)
            setUserVotes((previous) => ({ ...previous, ...votes }));
        } catch {
          toast({
            title: "Captions loaded",
            description: "Your votes could not be refreshed. Please reload before voting.",
          });
        }
      }
    } catch {
      if (request === loadRequest.current) {
        setLoadMoreError("We couldn’t load more captions. Your current results are still here.");
      }
    } finally {
      if (request === loadRequest.current) setIsLoadingMore(false);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    const newValue = parseInt(value);
    setItemsPerPage(newValue);
    setVisibleCount(newValue);
    setSelectedIndex(null);
  };

  const visibleCaptions = popularCaptions.slice(0, visibleCount);
  const hasMore = visibleCaptions.length < totalCount;
  const filterLabel = filterOptions.find((option) => option.key === filter)?.label;

  return (
    <div className="container mx-auto px-1 py-1">
      <div className="flex justify-center mb-8 relative" style={{ height: "44px" }}>
        <div
          className="relative flex justify-between w-full max-w-[470px] h-[36px] sm:h-[44px] 
                      bg-transparent rounded-3xl mx-auto border border-[#666363] overflow-hidden"
        >
          {/* Primary Slider */}
          <div
            className={`absolute top-0 left-0 h-[36px] sm:h-[44px] w-1/4 rounded-[16px] 
              bg-primary dark:bg-primary/40
                       transition-all duration-300 ${
                         filter === "week"
                           ? "rounded-l-3xl rounded-r-none"
                           : filter === "all"
                             ? "rounded-r-3xl rounded-l-none"
                             : "rounded-none"
                       }`}
            style={{
              transform: `translateX(${
                filter === "week" ? 0 : filter === "past30" ? 100 : filter === "year" ? 200 : 300
              }%)`,
            }}
          />

          {/* Buttons */}
          {filterOptions.map(({ key, label }) => {
            const isActive = filter === key;
            const className = `relative w-1/4 h-full flex items-center justify-center
                          text-xs sm:text-sm md:text-base font-normal leading-[120%]
                          tracking-[-0.02em] z-10 transition-colors 
                          duration-200 ${
                            isActive
                              ? "text-white dark:text-white border-2 border-primary"
                              : "text-gray-800 dark:text-[#9A9A9A]"
                          } ${
                            key === "week"
                              ? "rounded-l-3xl rounded-r-none"
                              : key === "all"
                                ? "rounded-r-3xl rounded-l-none"
                                : "rounded-none"
                          }`;

            return (
              <Link
                key={key}
                href={galleryHref(filterHrefs[key], initialSearch)}
                aria-current={isActive ? "page" : undefined}
                onNavigate={() => {
                  if (!isActive) setIsNavigating(true);
                }}
                className={className}
                scroll={false}
              >
                {label}
              </Link>
            );
          })}

          {/* Vertical Borders */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-[2px] bg-[#666363]"
              style={{ left: `${i * 25}%` }}
            />
          ))}
        </div>
      </div>
      <form
        role="search"
        aria-label="Search the caption gallery"
        action={pathname}
        method="get"
        onSubmit={submitSearch}
        className="mx-auto mb-5 w-full max-w-3xl space-y-3 px-2"
      >
        <div>
          <label htmlFor="caption-search" className="text-lg font-semibold">
            Find a caption
          </label>
          <p id="caption-search-help" className="mt-1 text-sm text-muted-foreground">
            Search public captions by a word or phrase you remember.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="caption-search"
              type="search"
              name="q"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Try Butler, midterms, or a phrase…"
              maxLength={GALLERY_SEARCH_MAX_LENGTH}
              aria-describedby="caption-search-help caption-search-status"
              aria-controls="caption-gallery-results"
              className="h-10 pl-10"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="h-10 gap-2">
            {isLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
            {isLoading ? "Loading…" : "Search"}
          </Button>
          {(searchInput || initialSearch) && (
            <Button
              type="button"
              variant="outline"
              onClick={clearSearch}
              disabled={isLoading}
              className="h-10 gap-2"
            >
              <X className="h-4 w-4" aria-hidden /> Clear search
            </Button>
          )}
        </div>
        <p
          id="caption-search-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm text-muted-foreground"
        >
          {isLoading
            ? "Loading captions…"
            : initialError
              ? ""
              : initialSearch
                ? totalCount +
                  (totalCount === 1 ? " match" : " matches") +
                  " for “" +
                  initialSearch +
                  "” in " +
                  filterLabel +
                  ". Showing " +
                  visibleCaptions.length +
                  "."
                : "Showing " +
                  visibleCaptions.length +
                  " of " +
                  totalCount +
                  " captions in " +
                  filterLabel +
                  "."}
        </p>
      </form>
      <div className="flex-1 w-full flex flex-col gap-8 p-4 relative">
        <div className="flex justify-end items-center w-full max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-4">
            <label htmlFor="caption-page-size" className="text-sm text-muted-foreground">
              Show
            </label>
            <select
              id="caption-page-size"
              aria-label="Captions to show at a time"
              value={itemsPerPage}
              onChange={(event) => handleItemsPerPageChange(event.target.value)}
              disabled={isLoading || isLoadingMore}
              className="rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm
                  text-primary focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-ring"
            >
              {[4, 8, 12, 16, 20, 24].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">at a time</span>
          </div>
        </div>
      </div>
      <section
        id="caption-gallery-results"
        aria-label="Caption results"
        aria-busy={isLoading || isLoadingMore}
      >
        {isLoading ? (
          <CaptionGridSkeleton count={itemsPerPage} />
        ) : initialError ? (
          <div
            role="alert"
            className="mx-auto max-w-xl rounded-xl border border-destructive/30 p-8 text-center"
          >
            <p className="mb-4">{initialError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => startTransition(() => router.refresh())}
            >
              Try again
            </Button>
          </div>
        ) : visibleCaptions.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-xl border border-border
            bg-muted/30 p-8 text-center">
            <h2 className="text-lg font-semibold">
              {initialSearch ? "No matching captions" : "No captions in this time range"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {initialSearch
                ? "Try a shorter phrase, check the spelling, or choose a different time range."
                : "Try another time range to explore the gallery."}
            </p>
            {initialSearch && (
              <Button type="button" variant="outline" onClick={clearSearch} className="mt-4">
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {visibleCaptions.map((caption, index) => {
              // generate our thumbnail urls
              const info = parseImageUrl(caption.image_url);
              let displayUrl = caption.image_url;

              let srcSet: string | undefined;
              if (info) {
                const baseUrl = caption.image_url.split("/").slice(0, 3).join("/");
                const t = generateThumbnailUrls(baseUrl, info.userId, info.imageId, info.extension);
                displayUrl = t.gridUrl;
                srcSet = t.srcSet;
              }

              const shareUrl = buildCaptionShareUrl(caption.id);
              const currentVote = userVotes[caption.id] ?? null;
              const isUpvoted = currentVote === 1;
              const isDownvoted = currentVote === -1;

              return (
                <div
                  key={caption.id}
                  className="relative cursor-pointer group w-full h-full flex"
                  onClick={() => handleImageClick(index)}
                >
                  <div
                    className="relative bg-white dark:bg-[#1a1a1a] rounded-lg overflow-hidden
                         shadow-md dark:shadow-lg ring-1 ring-gray-200 dark:ring-0
                         hover:shadow-xl transition-all duration-300 flex flex-col w-full
                         sm:max-w-[320px] sm:mx-auto"
                  >
                    {/* Top Section - Branding */}
                    <div className="p-3 flex justify-between items-center">
                      {/* Left: Crackd branding */}
                      <div className="flex items-center gap-2">
                        <BrandImage variant="mark" alt="Crackd" className="w-6 h-6" />
                        <span className="text-primary text-sm font-bold">Crackd</span>
                      </div>

                      {/* Right: Upvote/Downvote counter */}
                      <TooltipProvider>
                        <div className="flex flex-col items-center gap-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleVote(caption.id, 1);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isUpvoted
                                    ? "text-primary"
                                    : "text-gray-500 dark:text-gray-400 hover:text-primary"
                                }`}
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="left"
                              className="bg-white text-gray-900 border border-gray-200
                                       dark:bg-[#2a2a2a] dark:text-white
                                       dark:border-gray-700/50"
                            >
                              <p>Upvote</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-gray-900 dark:text-white text-sm font-medium">
                            {caption.like_count}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleVote(caption.id, -1);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isDownvoted
                                    ? "text-primary"
                                    : "text-gray-500 dark:text-gray-400 hover:text-primary"
                                }`}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="left"
                              className="bg-white text-gray-900 border border-gray-200
                                       dark:bg-[#2a2a2a] dark:text-white
                                       dark:border-gray-700/50"
                            >
                              <p>Downvote</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </div>

                    {/* Caption Text - Below header */}
                    <div className="px-3 pb-3">
                      <p
                        className="text-gray-900 dark:text-white text-base leading-relaxed
                                 font-medium"
                      >
                        {caption.content}
                      </p>
                    </div>

                    {/* Main Image */}
                    <div className="w-full flex-1 min-h-[320px] px-3 pb-3">
                      <Top100CaptionImage src={displayUrl} srcSet={srcSet} captionId={caption.id} />
                    </div>

                    {/* Bottom Action Bar */}
                    <div
                      className="p-3 bg-gray-50 dark:bg-[#1a1a1a] border-t border-gray-200
                               dark:border-white/10"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="p-2 text-gray-600 dark:text-white hover:bg-gray-200/70
                                    dark:hover:bg-white/10 rounded transition-colors flex
                                    items-center justify-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <BookmarkButton
                            bookmarked={savedCaptions.includes(caption.id)}
                            onClick={() => handleSlideSave(caption.id)}
                            size={20}
                          />
                        </div>
                        <div
                          className="p-2 hover:bg-gray-200/70 dark:hover:bg-white/10 rounded
                                    transition-colors flex items-center justify-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ShareModal
                            shareUrl={shareUrl}
                            buttonClassName="text-gray-600 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {loadMoreError && (
          <p role="alert" className="mt-6 text-center text-sm text-destructive">
            {loadMoreError}
          </p>
        )}
        {hasMore && !isLoading && !initialError && (
          <div className="flex justify-center mt-8">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              aria-controls="caption-gallery-results"
              className="flex items-center gap-2 px-6 py-2
                bg-primary/20 hover:bg-primary/30 text-primary
              rounded-full transition-colors duration-200 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {isLoadingMore
                ? "Loading captions…"
                : loadMoreError
                  ? "Try loading more"
                  : "Load More"}
            </button>
          </div>
        )}
      </section>

      {/* Modal */}
      {selectedIndex !== null && popularCaptions.length > 0 && (
        <CaptionModal
          items={popularCaptions.map((caption) => ({
            id: caption.id,
            content: caption.content,
            imageUrl: caption.image_url,
          }))}
          currentIndex={selectedIndex}
          onClose={handleCloseCarousel}
          onIndexChange={(index) => setSelectedIndex(index)}
          savedCaptionIds={savedCaptions}
          onSave={handleSlideSave}
          wrapNavigation
        />
      )}

      {/* New Post button */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40">
        <a
          href="/new"
          className="flex items-center justify-center w-48 h-12 rounded-full
                    bg-primary text-primary-foreground font-bold text-lg shadow-lg
                    hover:bg-primary/90 transition-colors duration-200
                    select-none"
        >
          New Post
        </a>
      </div>
      {/* Login Prompt Modal */}
      <LoginPromptModal
        open={showLoginPrompt}
        onOpenChange={setShowLoginPrompt}
        onProceed={() => {
          setShowLoginPrompt(false);
          router.push("/login");
        }}
      />
    </div>
  );
}
