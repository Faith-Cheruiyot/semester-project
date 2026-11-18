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
      <mark
        key={index}
        className="rounded-sm bg-primary/25 px-0.5 text-inherit ring-1 ring-primary/30"
      >
        {part.text}
      </mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}
