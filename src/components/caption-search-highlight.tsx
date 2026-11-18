import { Fragment } from "react";
import { captionMatchParts } from "@/lib/caption-gallery";

export function CaptionSearchHighlight({
  text,
  query = "",
}: {
  text: string;
  query?: string;
}) {
  return captionMatchParts(text, query).map((part, index) =>
    part.matched ? (
      <mark key={index} className="arcade-search-match">
        {part.text}
      </mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}
