import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as gallery from "../src/lib/caption-gallery.ts";

const { outputText } = ts.transpileModule(
  readFileSync(
    new URL("../src/app/actions/captions/fetch-popular-captions-action.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext } },
);

const caption = (n, changes = {}) => ({
  id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
  content: "Butler before midterms",
  created_datetime_utc: new Date(Date.now() - 86_400_000).toISOString(),
  like_count: 1000 - n,
  is_public: true,
  images: { url: "https://example.test/image.png", is_public: true, is_common_use: true },
  ...changes,
});

// A database boundary with LIKE semantics, filtering, ordering, exact counts,
// and inclusive ranges. Execute the real server action against these records.
function loadAction(rows, databaseError = null) {
  let clients = 0;
  const db = {
    from(table) {
      assert.equal(table, "captions");
      const predicates = [];
      const ordering = [];
      let first = 0;
      let last = 0;
      const value = (row, key) => key.split(".").reduce((v, k) => v?.[k], row);
      const query = {
        select(fields, options) {
          assert.match(fields, /images!inner/);
          assert.equal(options.count, "exact");
          return this;
        },
        eq(key, expected) {
          predicates.push((row) => value(row, key) === expected);
          return this;
        },
        gt(key, expected) {
          predicates.push((row) => value(row, key) > expected);
          return this;
        },
        gte(key, expected) {
          predicates.push((row) => value(row, key) >= expected);
          return this;
        },
        order(key, options) {
          ordering.push([key, options.ascending]);
          return this;
        },
        ilike(key, pattern) {
          let expression = "";
          const literal = (character) => character.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
          for (let index = 0; index < pattern.length; index++) {
            const char = pattern[index];
            expression +=
              char === "\\"
                ? literal(pattern[++index])
                : char === "%"
                  ? ".*"
                  : char === "_"
                    ? "."
                    : literal(char);
          }
          const match = new RegExp("^" + expression + "$", "is");
          predicates.push((row) => match.test(value(row, key) ?? ""));
          return this;
        },
        range(start, end) {
          first = start;
          last = end;
          return this;
        },
        async returns() {
          const filtered = rows
            .filter((row) => predicates.every((predicate) => predicate(row)))
            .sort((a, b) => {
              for (const [key, ascending] of ordering) {
                const av = value(a, key),
                  bv = value(b, key);
                if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
          return {
            data: filtered.slice(first, last + 1),
            count: filtered.length,
            error: databaseError,
          };
        },
      };
      return query;
    },
  };
  const exports = {};
  new Function("require", "exports", "console", outputText)(
    (name) => {
      if (name === "@/lib/caption-gallery") return gallery;
      if (name === "@/utils/supabase/server")
        return {
          createClient: async () => {
            clients++;
            return db;
          },
        };
      throw new Error("Unexpected dependency: " + name);
    },
    exports,
    { error() {} },
  );
  return { ...exports, clientCount: () => clients };
}

test("search finds a remembered phrase beyond the first 100 regardless of case", async () => {
  const later = caption(200, { content: "Remember the Butler basement" });
  const action = loadAction([
    ...Array.from({ length: 150 }, (_, n) => caption(n, { content: "An unrelated joke" })),
    later,
  ]);
  const browsing = await action.fetchPopularCaptionsAction(100, "all");
  assert.equal(
    browsing.some((row) => row.id === later.id),
    false,
  );
  for (const search of ["butler", "BUTLER", "  Remember the BUTLER  "]) {
    const page = await action.fetchCaptionGalleryPageAction({ search });
    assert.deepEqual(
      page.captions.map((row) => row.id),
      [later.id],
    );
    assert.equal(page.totalCount, 1);
    assert.equal(page.captions[0].image_url, later.images.url);
  }
});

test("search preserves the gallery public visibility and positive-vote rules", async () => {
  const action = loadAction([
    caption(1),
    caption(2, { is_public: false }),
    caption(3, { like_count: 0 }),
    caption(4, { images: { url: "private.png", is_public: false } }),
    caption(5, { images: null }),
  ]);
  const page = await action.fetchCaptionGalleryPageAction({ search: "Butler" });
  assert.deepEqual(
    page.captions.map((row) => row.id),
    [caption(1).id],
  );
  assert.equal(page.totalCount, 1);
});

test("search pagination reaches every matching caption including matches after 100", async () => {
  const rows = Array.from({ length: 145 }, (_, index) => caption(index));
  const action = loadAction([...rows, caption(200, { content: "Unrelated" })]);
  const ids = [];
  for (let offset = 0; offset < rows.length; offset += 24) {
    const page = await action.fetchCaptionGalleryPageAction({
      search: "midterms",
      offset,
      limit: 24,
    });
    assert.equal(page.totalCount, 145);
    ids.push(...page.captions.map((row) => row.id));
  }
  assert.deepEqual(
    ids,
    rows.map((row) => row.id),
  );
  assert.equal(new Set(ids).size, 145);
});

test("ordinary browsing and clearing a search preserve the existing Top 100 limit", async () => {
  const action = loadAction(Array.from({ length: 145 }, (_, n) => caption(n)));
  const last = await action.fetchCaptionGalleryPageAction({ search: "  ", offset: 96, limit: 24 });
  assert.equal(last.captions.length, 4);
  assert.equal(last.totalCount, 100);
  const end = await action.fetchCaptionGalleryPageAction({ offset: 100 });
  assert.deepEqual(end.captions, []);
  assert.equal(end.totalCount, 100);
});

test("each time filter narrows matches before paging and counting", async () => {
  const action = loadAction(
    [2, 10, 40, 430].map((days, n) =>
      caption(n, {
        created_datetime_utc: new Date(Date.now() - days * 86_400_000).toISOString(),
      }),
    ),
  );
  for (const [period, expected] of [
    ["week", 1],
    ["past30", 2],
    ["year", 3],
    ["all", 4],
  ]) {
    const page = await action.fetchCaptionGalleryPageAction({ period, search: "butler" });
    assert.equal(page.totalCount, expected);
    assert.equal(page.captions.length, expected);
  }
});

test("literal percent, underscore, and backslash do not broaden a search", async () => {
  const action = loadAction([
    caption(1, { content: "100% ready" }),
    caption(2, { content: "1000 ready" }),
    caption(3, { content: "file_name" }),
    caption(4, { content: "filename" }),
    caption(5, { content: "path\\caption" }),
  ]);
  for (const [search, id] of [
    ["%", 1],
    ["_", 3],
    ["\\", 5],
  ]) {
    const page = await action.fetchCaptionGalleryPageAction({ search });
    assert.deepEqual(
      page.captions.map((row) => row.id),
      [caption(id).id],
    );
  }
});

test("tied scores and dates have a stable ID order across pages", async () => {
  const rows = Array.from({ length: 12 }, (_, n) =>
    caption(n, { like_count: 10, created_datetime_utc: "2026-01-01T00:00:00Z" }),
  );
  const action = loadAction(rows.toReversed());
  const first = await action.fetchCaptionGalleryPageAction({ search: "butler", limit: 8 });
  const second = await action.fetchCaptionGalleryPageAction({
    search: "butler",
    offset: 8,
    limit: 8,
  });
  assert.deepEqual(
    [...first.captions, ...second.captions].map((row) => row.id),
    rows.map((row) => row.id),
  );
});

test("no matches are distinct from database failures and invalid paging is rejected", async () => {
  const action = loadAction([caption(1)]);
  assert.deepEqual(await action.fetchCaptionGalleryPageAction({ search: "no-such-caption" }), {
    captions: [],
    totalCount: 0,
  });
  await assert.rejects(
    loadAction([], { message: "Internal database detail" }).fetchCaptionGalleryPageAction({
      search: "butler",
    }),
    /^Error: Unable to load captions/,
  );
  const invalid = loadAction([]);
  for (const request of [
    { offset: -1 },
    { offset: NaN },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { period: "unknown" },
  ]) {
    await assert.rejects(invalid.fetchCaptionGalleryPageAction(request), /Invalid gallery request/);
  }
  assert.equal(invalid.clientCount(), 0);
});

test("search URLs preserve phrases and punctuation and clearing removes the query", () => {
  assert.equal(
    gallery.galleryHref("/top-100/past-year", " Butler & midterms "),
    "/top-100/past-year?q=Butler+%26+midterms",
  );
  assert.equal(gallery.galleryHref("/top-100/all-time", ""), "/top-100/all-time");
  assert.equal(gallery.normalizeGallerySearch(null), "");
  assert.equal(gallery.normalizeGallerySearch("x".repeat(250)).length, 200);
});
