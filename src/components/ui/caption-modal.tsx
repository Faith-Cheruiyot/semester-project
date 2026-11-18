"use client";

import { useRef, type ReactNode } from "react";
import { CaptionViewV2 } from "@/components/ui/caption-view-v2";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { buildCaptionShareUrl } from "@/utils/site-url";

export type CaptionModalItem = {
  id: string;
  content: string;
  imageUrl: string;
  isPublic?: boolean;
  isOwner?: boolean;
};

type CaptionModalProps = {
  items: CaptionModalItem[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  savedCaptionIds: string[];
  onSave: (captionId: string) => void | Promise<void>;
  actions?: ReactNode;
  emptyState?: ReactNode;
  wrapNavigation?: boolean;
  highlightQuery?: string;
};

export function CaptionModal({
  items,
  currentIndex,
  onClose,
  onIndexChange,
  savedCaptionIds,
  onSave,
  actions,
  emptyState,
  wrapNavigation = false,
  highlightQuery,
}: CaptionModalProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const safeIndex = Math.max(0, Math.min(currentIndex, items.length - 1));
  const current = items[safeIndex];
  const hasMultiple = items.length > 1;
  const hasPrevious = wrapNavigation ? hasMultiple : safeIndex > 0;
  const hasNext = wrapNavigation ? hasMultiple : safeIndex < items.length - 1;

  const handlePrevious = () => {
    if (!hasMultiple) return;
    onIndexChange(
      wrapNavigation && safeIndex === 0
        ? items.length - 1
        : Math.max(0, safeIndex - 1),
    );
  };

  const handleNext = () => {
    if (!hasMultiple) return;
    onIndexChange(
      wrapNavigation && safeIndex === items.length - 1
        ? 0
        : Math.min(items.length - 1, safeIndex + 1),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-caption-viewer
        className="arcade-viewer w-[calc(100vw-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)]
          overflow-y-auto p-4"
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          if (previousFocus.current?.isConnected) {
            event.preventDefault();
            previousFocus.current.focus({ preventScroll: true });
          }
        }}
      >
        <DialogTitle className="sr-only">Caption viewer</DialogTitle>
        <DialogDescription className="sr-only">
          View the full caption and image. Close to return to the previous view.
        </DialogDescription>
        <div className="relative flex flex-col items-center pt-4">
          {current ? (
            <>
              <CaptionViewV2
                id={current.id}
                imageUrl={current.imageUrl}
                content={current.content}
                highlightQuery={highlightQuery}
                tone="auto"
                saved={savedCaptionIds.includes(current.id)}
                onSave={onSave}
                shareUrl={buildCaptionShareUrl(current.id)}
                isPublic={current.isPublic ?? false}
                isOwner={current.isOwner ?? false}
                imageClassName="h-auto max-h-[50dvh] w-full object-contain"
                onPrevious={hasMultiple ? handlePrevious : undefined}
                onNext={hasMultiple ? handleNext : undefined}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
                currentIndex={safeIndex}
                totalCount={items.length}
              />
              {actions}
            </>
          ) : (
            (emptyState ?? (
              <p className="text-lg text-center text-foreground">
                No captions available.
              </p>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
