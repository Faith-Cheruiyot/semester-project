import {
  fetchCaptionGalleryPageAction,
} from "@/app/actions/captions/fetch-popular-captions-action";
import { fetchUserCaptionVotesAction } from "@/app/actions/captions";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import PopularCaptionsPageClient from "@/components/popular-captions-page-client";
import {
  type GalleryPage,
  type GalleryPeriod,
  type GallerySearchParams,
} from "@/lib/caption-gallery";

interface PopularCaptionsPageProps {
  initialFilter?: GalleryPeriod;
  searchParams?: GallerySearchParams;
  pastWeekHref?: string;
  pastMonthHref?: string;
  pastYearHref?: string;
  allTimeHref?: string;
}

export default async function PopularCaptionsPage({
  initialFilter = "week",
  ...filterHrefs
}: PopularCaptionsPageProps) {
  // Header search is a text-only preview; gallery browsing stays unfiltered for now.
  let page: GalleryPage = { captions: [], totalCount: 0 };
  let initialError = "";
  try {
    page = await fetchCaptionGalleryPageAction({ period: initialFilter });
  } catch {
    initialError = "We couldn’t load the captions. Please try again.";
  }
  const auth = await checkAuthStatusAction();
  const isAuthenticated = auth.isAuthenticated && !auth.isAnonymous;
  let initialUserVotes: Record<string, 1 | -1 | null> = {};
  if (isAuthenticated && page.captions.length) {
    initialUserVotes = await fetchUserCaptionVotesAction(
      page.captions.map((caption) => caption.id),
    );
  }

  return (
    <PopularCaptionsPageClient
      key={`${initialFilter}:${initialError ? "error" : "loaded"}`}
      initialFilter={initialFilter}
      initialTotalCount={page.totalCount}
      initialError={initialError}
      {...filterHrefs}
      initialCaptions={page.captions}
      initialUserVotes={initialUserVotes}
      initialIsAuthenticated={isAuthenticated}
    />
  );
}
