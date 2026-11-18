import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as gallery from "../src/lib/caption-gallery.ts";

const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(
  readFileSync(
    new URL("../src/components/caption-search-highlight.tsx", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
);
const exports = {};
new Function("require", "exports", outputText)(
  (name) => (name === "@/lib/caption-gallery" ? gallery : require(name)),
  exports,
);

test("highlights every case-insensitive match while preserving the original caption", () => {
  const text = "Butler is busy. BUTLER again, then butler.";
  const parts = gallery.captionMatchParts(text, "butler");
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(
    parts.filter((part) => part.matched).map((part) => part.text),
    ["Butler", "BUTLER", "butler"],
  );
});

test("phrases highlight together and partial-word matching agrees with gallery search", () => {
  const phrase = gallery.captionMatchParts(
    "That quiet study room is not quiet study.",
    " quiet study ",
  );
  assert.deepEqual(
    phrase.filter((part) => part.matched).map((part) => part.text),
    ["quiet study", "quiet study"],
  );
  assert.deepEqual(
    gallery
      .captionMatchParts("Butler's and Butlers", "butler")
      .filter((part) => part.matched)
      .map((part) => part.text),
    ["Butler", "Butler"],
  );
});

test("search punctuation is literal rather than a regular expression", () => {
  for (const query of ["[a+b]", "100%", "file_name", "a.b", "(test)", "$5", "path\\file"]) {
    const text = "Before " + query + " after";
    const parts = gallery.captionMatchParts(text, query);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.deepEqual(
      parts.filter((part) => part.matched).map((part) => part.text),
      [query],
    );
  }
  assert.equal(
    gallery.captionMatchParts("axb", "a.b").some((part) => part.matched),
    false,
  );
});

test("cleared or unmatched searches leave the caption unmarked", () => {
  for (const query of ["", "   ", "a different topic"]) {
    assert.deepEqual(gallery.captionMatchParts("A caption in Butler", query), [
      { text: "A caption in Butler", matched: false },
    ]);
  }
});

test("matching supports accented text without changing its spelling", () => {
  const parts = gallery.captionMatchParts("CAFÉ before café", "café");
  assert.deepEqual(
    parts.filter((part) => part.matched).map((part) => part.text),
    ["CAFÉ", "café"],
  );
});

test("rendered highlights escape caption text instead of interpreting it as HTML", () => {
  const html = renderToStaticMarkup(
    createElement(exports.CaptionSearchHighlight, {
      text: '<img src=x onerror="alert(1)"> Butler & BUTLER',
      query: "butler",
    }),
  );
  assert.equal((html.match(/<mark /g) ?? []).length, 2);
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp;"));
  assert.equal(html.includes("<img"), false);
  assert.match(html, />Butler<\/mark>/);
  assert.match(html, />BUTLER<\/mark>/);
});
