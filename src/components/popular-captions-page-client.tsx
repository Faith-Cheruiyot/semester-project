"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { useRouter } from "next/navigation";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import Link from "next/link";
import { ChevronUp, ChevronDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GALLERY_BATCH_SIZE,
  type GalleryCaption,
  type GalleryPeriod,
} from "@/lib/caption-gallery";
import { TOP_100_FILTER_HREFS } from "@/lib/top-100";
import { buildCaptionShareUrl } from "@/utils/site-url";
import { BrandImage } from "@/components/brand-image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CaptionModal } from "@/components/ui/caption-modal";
import { BookmarkButton } from "@/components/ui/bookmark-button";
import { Top100CaptionImage } from "@/components/top-100-caption-image";

// functions to load in our pregenrated thumbnails
const THUMBNAIL_SIZES = [
  320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

const parseImageUrl = (url: string) => {
  // expects: https://images.domain.com/<userId>/<imageId>.<ext>
  const match = url.match(
    /https?:\/\/[^\/]+\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)/,
  );
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
    srcSet: THUMBNAIL_SIZES.map(
      (size) => `${basePath}-${size}.${extension} ${size}w`,
    ).join(", "),
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
  initialTotalCount = initialCaptions.length,
  initialError = "",
}: PopularCaptionsPageClientProps) {
  const [popularCaptions, setPopularCaptions] =
    useState<PopularCaption[]>(initialCaptions);
  const [userVotes, setUserVotes] =
    useState<Record<string, 1 | -1 | null>>(initialUserVotes);
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const loadRequest = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [visibleCount, setVisibleCount] = useState(8);
  const { toast } = useToast();
  const router = useRouter();
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
    const originalCount =
      popularCaptions.find((c) => c.id === captionId)?.like_count || 0;

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
          caption.id === captionId
            ? { ...caption, like_count: originalCount }
            : caption,
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
    const handleArrowKeys = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        selectedIndex === null ||
        !popularCaptions.length
      )
        return;
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest("[data-caption-viewer]") ||
        event.target.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      )
        return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? popularCaptions.length - 1 : prev - 1;
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === popularCaptions.length - 1 ? 0 : prev + 1;
        });
      }
    };

    document.addEventListener("keydown", handleArrowKeys);
    return () => {
      document.removeEventListener("keydown", handleArrowKeys);
    };
  }, [selectedIndex, popularCaptions.length]);

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
        offset: popularCaptions.length,
        limit: GALLERY_BATCH_SIZE,
      });
      if (request !== loadRequest.current) return;
      setPopularCaptions((previous) => {
        const ids = new Set(previous.map((caption) => caption.id));
        return [
          ...previous,
          ...page.captions.filter((caption) => !ids.has(caption.id)),
        ];
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
            description:
              "Your votes could not be refreshed. Please reload before voting.",
          });
        }
      }
    } catch {
      if (request === loadRequest.current) {
        setLoadMoreError(
          "We couldn’t load more captions. Your current results are still here.",
        );
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
  const filterLabel = filterOptions.find(
    (option) => option.key === filter,
  )?.label;

  return (
    <div className="arcade-gallery container mx-auto px-1">
      <div className="arcade-scenery" aria-hidden="true">
        <span className="arcade-cloud arcade-cloud-one" />
        <span className="arcade-cloud arcade-cloud-two" />
        <span className="arcade-cloud arcade-cloud-three" />
      </div>
      <p className="arcade-stage-label">Caption gallery</p>
      <nav className="arcade-time-nav" aria-label="Caption time range">
        {filterOptions.map(({ key, label }) => (
          <Link
            key={key}
            href={filterHrefs[key]}
            aria-current={filter === key ? "page" : undefined}
            onNavigate={() => {
              if (filter !== key) setIsNavigating(true);
            }}
            className="arcade-time-tab"
            scroll={false}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="app-gallery-toolbar">
        <p
          id="caption-gallery-status"
          role="status"
          aria-live="polite"
          className="app-gallery-status"
        >
          {isLoading
            ? "Loading captions…"
            : initialError
              ? ""
              : `Showing ${visibleCaptions.length} of ${totalCount} captions in ${filterLabel}.`}
        </p>
        <div className="arcade-toolbar">
          <div className="flex items-center gap-2">
            <label
              htmlFor="caption-page-size"
              className="text-sm text-muted-foreground"
            >
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
          <div className="arcade-empty">
            <h2 className="text-lg font-semibold">
              No captions in {filterLabel}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              There are no public captions in this time range.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {filter !== "all"
                ? "Try All Time to look beyond this time range."
                : "Check back soon for more captions."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {filter !== "all" && (
                <Button asChild>
                  <Link
                    href={allTimeHref}
                    onNavigate={() => setIsNavigating(true)}
                    scroll={false}
                  >
                    Browse all time
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {visibleCaptions.map((caption, index) => {
              // generate our thumbnail urls
              const info = parseImageUrl(caption.image_url);
              let displayUrl = caption.image_url;

              let srcSet: string | undefined;
              if (info) {
                const baseUrl = caption.image_url
                  .split("/")
                  .slice(0, 3)
                  .join("/");
                const t = generateThumbnailUrls(
                  baseUrl,
                  info.userId,
                  info.imageId,
                  info.extension,
                );
                displayUrl = t.gridUrl;
                srcSet = t.srcSet;
              }

              const shareUrl = buildCaptionShareUrl(caption.id);
              const currentVote = userVotes[caption.id] ?? null;
              const isUpvoted = currentVote === 1;
              const isDownvoted = currentVote === -1;

              return (
                <article
                  key={caption.id}
                  data-caption-id={caption.id}
                  aria-label={"Caption: " + caption.content}
                  className="relative group w-full h-full flex"
                >
                  <div className="arcade-caption-card">
                    {/* Top Section - Branding */}
                    <div className="arcade-card-header">
                      {/* Left: Crackd branding */}
                      <div className="flex items-center gap-2">
                        <BrandImage
                          variant="mark"
                          alt="Crackd"
                          className="w-6 h-6"
                        />
                        <span className="arcade-card-brand">Crackd</span>
                      </div>

                      {/* Right: Upvote/Downvote counter */}
                      <TooltipProvider>
                        <div className="arcade-votes">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Upvote caption"
                                aria-pressed={isUpvoted}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleVote(caption.id, 1);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isUpvoted
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-primary"
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
                          <span className="text-foreground text-sm">
                            {caption.like_count}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Downvote caption"
                                aria-pressed={isDownvoted}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleVote(caption.id, -1);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isDownvoted
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-primary"
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

                    <button
                      type="button"
                      onClick={() => handleImageClick(index)}
                      aria-label={"View caption: " + caption.content}
                      className="flex flex-1 w-full flex-col text-left
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-inset focus-visible:ring-primary"
                    >
                      <span className="arcade-caption-copy">
                        {caption.content}
                      </span>
                      <span className="arcade-caption-art">
                        <Top100CaptionImage
                          src={displayUrl}
                          srcSet={srcSet}
                          captionId={caption.id}
                        />
                      </span>
                    </button>

                    {/* Bottom Action Bar */}
                    <div className="arcade-card-footer">
                      <div className="flex items-center justify-between">
                        <div
                          className="p-2 text-foreground hover:bg-accent
                                    rounded transition-colors flex
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
                          className="p-2 hover:bg-accent rounded
                                    transition-colors flex items-center justify-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ShareModal
                            shareUrl={shareUrl}
                            buttonClassName="text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
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
            <Button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              aria-controls="caption-gallery-results"
              className="gap-2 px-6 disabled:cursor-wait"
            >
              {isLoadingMore && (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isLoadingMore
                ? "Loading captions…"
                : loadMoreError
                  ? "Try loading more"
                  : "Load More"}
            </Button>
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
