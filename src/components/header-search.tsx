"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import {
  GALLERY_SEARCH_MAX_LENGTH,
  galleryHref,
  normalizeGallerySearch,
} from "@/lib/caption-gallery";

export function HeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isGallery =
    pathname === "/" ||
    pathname === "/top-100" ||
    pathname.startsWith("/top-100/");
  const searchPath = isGallery ? pathname : "/";
  const activeSearch = isGallery
    ? normalizeGallerySearch(searchParams.get("q"))
    : "";
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [draft, setDraft] = useState(() => ({ routeKey, value: activeSearch }));
  if (draft.routeKey !== routeKey) {
    setDraft({ routeKey, value: activeSearch });
  }
  const text = draft.routeKey === routeKey ? draft.value : activeSearch;
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterSearch = useRef(false);

  useEffect(() => {
    if (!isPending && focusAfterSearch.current) {
      focusAfterSearch.current = false;
      if (
        document.activeElement === document.body ||
        inputRef.current?.form?.contains(document.activeElement)
      ) {
        inputRef.current?.focus();
      }
    }
  }, [isPending, routeKey]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = normalizeGallerySearch(text);
    setDraft({ routeKey, value: query });
    if (isGallery && query === activeSearch) return;
    focusAfterSearch.current = true;
    startTransition(() =>
      router.push(galleryHref(searchPath, query), { scroll: true }),
    );
  };

  const clearSearch = () => {
    setDraft({ routeKey, value: "" });
    inputRef.current?.focus();
    if (activeSearch) {
      focusAfterSearch.current = true;
      startTransition(() => router.push(searchPath, { scroll: true }));
    }
  };

  return (
    <form
      className="app-search"
      role="search"
      aria-label="Search captions"
      aria-busy={isPending}
      action={searchPath}
      method="get"
      onSubmit={submitSearch}
    >
      <Search size={22} className="app-search-symbol" aria-hidden="true" />
      <label htmlFor="header-search" className="sr-only">
        Search
      </label>
      <input
        id="header-search"
        ref={inputRef}
        type="text"
        role="searchbox"
        name="q"
        value={text}
        onChange={(event) => setDraft({ routeKey, value: event.target.value })}
        placeholder="Search"
        autoComplete="off"
        maxLength={GALLERY_SEARCH_MAX_LENGTH}
        disabled={isPending}
        aria-describedby="header-search-help"
      />
      <span id="header-search-help" className="sr-only">
        Enter a word or phrase, then press Enter or Search to find matching
        captions.
      </span>
      {(text || activeSearch) && (
        <button
          type="button"
          className="app-search-clear"
          aria-label="Clear search"
          disabled={isPending}
          onClick={clearSearch}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
      <button
        type="submit"
        className="app-search-submit"
        aria-label={isPending ? "Searching captions" : "Search captions"}
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <Search
            size={18}
            className="app-search-submit-icon"
            aria-hidden="true"
          />
        )}
        <span>{isPending ? "Searching…" : "Search"}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {isPending ? "Searching captions…" : ""}
      </span>
    </form>
  );
}
