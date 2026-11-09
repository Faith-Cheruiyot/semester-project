import PopularCaptionsPage from "@/components/popular-captions-page";
import { TOP_100_FILTER_HREFS } from "@/lib/top-100";
import type { GallerySearchParams } from "@/lib/caption-gallery";

export default function Top100PastYearPage({
  searchParams,
}: {
  searchParams: GallerySearchParams;
}) {
  return (
    <PopularCaptionsPage
      initialFilter="year"
      searchParams={searchParams}
      {...TOP_100_FILTER_HREFS}
    />
  );
}
