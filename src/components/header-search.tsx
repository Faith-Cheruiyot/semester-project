"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

export function HeaderSearch() {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="app-search" role="search" aria-label="Search preview">
      <Search size={22} aria-hidden="true" />
      <label htmlFor="header-search" className="sr-only">
        Search
      </label>
      <input
        id="header-search"
        ref={inputRef}
        type="text"
        role="searchbox"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search"
        autoComplete="off"
        maxLength={200}
        aria-describedby="header-search-help"
      />
      <span id="header-search-help" className="sr-only">
        You can enter text here. Search results are not enabled yet.
      </span>
      {text && (
        <button
          type="button"
          className="app-search-clear"
          aria-label="Clear search text"
          onClick={() => {
            setText("");
            inputRef.current?.focus();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
      <span className="app-search-note" aria-hidden="true">
        Coming soon
      </span>
    </div>
  );
}
