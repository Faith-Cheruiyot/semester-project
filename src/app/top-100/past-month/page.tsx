import PopularCaptionsPage from "@/components/popular-captions-page";
import { TOP_100_FILTER_HREFS } from "@/lib/top-100";
import type { GallerySearchParams } from "@/lib/caption-gallery";

export default function Top100PastMonthPage({
  searchParams,
}: {
  searchParams: GallerySearchParams;
}) {
  return (
    <PopularCaptionsPage
      initialFilter="past30"
      searchParams={searchParams}
      {...TOP_100_FILTER_HREFS}
    />
  );
}
