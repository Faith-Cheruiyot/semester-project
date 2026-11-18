import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as gallery from "../src/lib/caption-gallery.ts";

const require = createRequire(import.meta.url);

function loadComponent(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  new Function("require", "exports", outputText)(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    exports,
  );
  return exports;
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
}

function headerHarness(path) {
  let url = new URL(path, "https://captions.test");
  const calls = [];
  const slots = [];
  let cursor = 0;
  const { HeaderSearch } = loadComponent(
    "../src/components/header-search.tsx",
    {
      "@/lib/caption-gallery": gallery,
      "lucide-react": {
        LoaderCircle: () => null,
        Search: () => null,
        X: () => null,
      },
      "next/navigation": {
        usePathname: () => url.pathname,
        useSearchParams: () => url.searchParams,
        useRouter: () => ({
          push: (href, options) => calls.push({ href, options }),
        }),
      },
      react: {
        useEffect: () => {},
        useTransition: () => [false, (callback) => callback()],
        useRef: (value) => (slots[cursor++] ??= { current: value }),
        useState: (initial) => {
          const index = cursor++;
          if (!(index in slots))
            slots[index] = typeof initial === "function" ? initial() : initial;
          return [
            slots[index],
            (value) => {
              slots[index] = value;
            },
          ];
        },
      },
    },
  );
  const render = () => {
    cursor = 0;
    return HeaderSearch();
  };
  const input = () => findNode(render(), (node) => node.type === "input");
  return {
    calls,
    render,
    input,
    type: (value) => input().props.onChange({ target: { value } }),
    submit: () => render().props.onSubmit({ preventDefault() {} }),
    navigate: (path) => {
      url = new URL(path, url);
    },
    clear: () =>
      findNode(
        render(),
        (node) => node.props?.["aria-label"] === "Clear search",
      ).props.onClick(),
  };
}

test("header input submits remembered words to a real gallery URL", () => {
  const header = headerHarness("/");
  assert.equal(header.render().type, "form");
  assert.equal(header.render().props.method, "get");
  assert.equal(header.input().props.name, "q");
  header.type("  Butler quiet study  ");
  header.submit();
  assert.deepEqual(header.calls, [
    { href: "/?q=Butler+quiet+study", options: { scroll: true } },
  ]);
});

test("header search keeps the current time range and literal punctuation", () => {
  const header = headerHarness("/top-100/past-week?q=old");
  header.type("100% _ [study]");
  header.submit();
  const target = new URL(header.calls[0].href, "https://captions.test");
  assert.equal(target.pathname, "/top-100/past-week");
  assert.equal(target.searchParams.get("q"), "100% _ [study]");
});

test("search from other pages goes to Home and unsent text clears without leaving the page", () => {
  const header = headerHarness("/new?image=selected");
  header.type("draft");
  header.clear();
  assert.equal(header.input().props.value, "");
  assert.equal(header.calls.length, 0);
  header.type("midterms");
  header.submit();
  assert.equal(header.calls[0].href, "/?q=midterms");
});

test("URL changes restore the input and Clear removes an applied query", () => {
  const header = headerHarness("/?q=butler");
  assert.equal(header.input().props.value, "butler");
  header.type("unsent edit");
  header.navigate("/?q=midterms");
  assert.equal(header.input().props.value, "midterms");
  header.clear();
  assert.equal(header.calls[0].href, "/");
  header.navigate("/");
  assert.equal(header.input().props.value, "");
});

test("browser Back restores the old query rather than an edit submitted from that URL", () => {
  const header = headerHarness("/?q=butler");
  header.type("midterms");
  header.submit();
  header.navigate("/?q=midterms");
  assert.equal(header.input().props.value, "midterms");
  header.navigate("/?q=butler");
  assert.equal(header.input().props.value, "butler");
});

function galleryPageHarness({ fail = false } = {}) {
  const calls = [];
  const page = loadComponent("../src/components/popular-captions-page.tsx", {
    "@/lib/caption-gallery": gallery,
    "@/app/actions/captions/fetch-popular-captions-action": {
      fetchCaptionGalleryPageAction: async (args) => {
        calls.push(args);
        if (fail) throw new Error("Database unavailable");
        return {
          captions: [{ id: "match", content: "Butler" }],
          totalCount: 82,
        };
      },
    },
    "@/app/actions/captions": {
      fetchUserCaptionVotesAction: () =>
        assert.fail("Guest must not load private votes"),
    },
    "@/app/actions/auth/check-auth-status": {
      checkAuthStatusAction: async () => ({
        isAuthenticated: false,
        isAnonymous: false,
      }),
    },
    "@/components/popular-captions-page-client": { default: () => null },
  }).default;
  return { calls, page };
}

test("gallery page forwards URL text to data loading and result rendering", async () => {
  const { calls, page } = galleryPageHarness();
  const result = await page({
    initialFilter: "all",
    searchParams: Promise.resolve({ q: " Butler " }),
  });
  assert.deepEqual(calls, [{ period: "all", search: "Butler" }]);
  assert.equal(result.props.initialSearch, "Butler");
  assert.equal(result.props.initialTotalCount, 82);
  assert.equal(result.props.initialCaptions[0].id, "match");
});

test("gallery page preserves query and period for repeated URL parameters", async () => {
  const { calls, page } = galleryPageHarness();
  const result = await page({
    initialFilter: "week",
    searchParams: Promise.resolve({ q: ["midterms", "ignored"] }),
  });
  assert.deepEqual(calls, [{ period: "week", search: "midterms" }]);
  assert.equal(result.props.initialSearch, "midterms");
});

test("a data failure stays distinct from an empty search and retains the retry query", async () => {
  const { page } = galleryPageHarness({ fail: true });
  const result = await page({
    initialFilter: "all",
    searchParams: Promise.resolve({ q: "butler" }),
  });
  assert.equal(result.props.initialSearch, "butler");
  assert.ok(result.props.initialError.includes("couldn’t load"));
  assert.deepEqual(result.props.initialCaptions, []);
});
