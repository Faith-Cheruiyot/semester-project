import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as authHelpers from "../src/utils/google-auth.ts";

const require = createRequire(import.meta.url);

function loadSource(path, mocks) {
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

test("provider checks distinguish disabled Google from an unavailable auth service", async () => {
  for (const [google, expected] of [
    [true, "enabled"],
    [false, "disabled"],
  ]) {
    const status = await authHelpers.getGoogleProviderStatus(
      "https://project.supabase.co",
      "public-key",
      async (url, options) => {
        assert.equal(url.href, "https://project.supabase.co/auth/v1/settings");
        assert.equal(options.cache, "no-store");
        assert.equal(options.headers.apikey, "public-key");
        return Response.json({ external: { google } });
      },
    );
    assert.equal(status, expected);
  }
  for (const response of [
    new Response(null, { status: 503 }),
    Response.json({}),
  ]) {
    assert.equal(
      await authHelpers.getGoogleProviderStatus(
        "https://project.supabase.co",
        "public-key",
        async () => response,
      ),
      "unavailable",
    );
  }
  assert.equal(
    await authHelpers.getGoogleProviderStatus(
      "https://project.supabase.co",
      "public-key",
      async () => {
        throw new Error("Offline");
      },
    ),
    "unavailable",
  );
});

test("OAuth callback keeps the initiating host and falls back only when necessary", () => {
  assert.equal(
    authHelpers.getGoogleCallbackUrl(
      "http://localhost:3100",
      "https://production.test",
    ),
    "http://localhost:3100/auth/callback",
  );
  assert.equal(
    authHelpers.getGoogleCallbackUrl(
      "https://preview.test",
      "https://production.test",
    ),
    "https://preview.test/auth/callback",
  );
  assert.equal(
    authHelpers.getGoogleCallbackUrl(
      "null",
      "https://production.test/old-path",
    ),
    "https://production.test/auth/callback",
  );
  assert.throws(() => authHelpers.getGoogleCallbackUrl(null));
  assert.throws(() =>
    authHelpers.getGoogleCallbackUrl("https://user:password@host.test"),
  );
});

test("auth return destinations cannot leave the application", () => {
  assert.equal(
    authHelpers.getSafeAuthReturnPath("/saved?q=butler"),
    "/saved?q=butler",
  );
  for (const path of [
    null,
    "",
    "https://external.test",
    "//external.test",
    "@external.test",
    "/\\external.test",
    "/\n/external.test",
  ]) {
    assert.equal(authHelpers.getSafeAuthReturnPath(path), "/");
  }
});

function actionHarness({
  status = "enabled",
  origin = "https://semester.test",
  sdkError = null,
  authorizationUrl = "https://project.supabase.co/auth/v1/authorize",
} = {}) {
  const calls = [];
  const { signInWithGoogleAction } = loadSource(
    "../src/app/actions/auth/login-with-google-action.ts",
    {
      "@/utils/google-auth": {
        ...authHelpers,
        getGoogleProviderStatus: async () => status,
      },
      "next/headers": {
        headers: async () => new Headers(origin ? { origin } : {}),
      },
      "next/navigation": {
        redirect: (url) => {
          throw Object.assign(new Error("Redirect"), { url });
        },
      },
      "@/utils/utils": {
        encodedRedirect: (type, path, message) => {
          throw Object.assign(new Error(message), {
            url: `${path}?${type}=${encodeURIComponent(message)}`,
          });
        },
      },
      "@/utils/supabase/server": {
        createClient: async () => {
          calls.push("client");
          return {
            auth: {
              signInWithOAuth: async (args) => {
                calls.push(args);
                return { data: { url: authorizationUrl }, error: sdkError };
              },
            },
          };
        },
      },
    },
  );
  return { calls, run: signInWithGoogleAction };
}

test("a disabled provider returns a login error before starting a broken OAuth attempt", async () => {
  const action = actionHarness({ status: "disabled" });
  await assert.rejects(
    action.run(),
    (error) =>
      error.url.startsWith("/login?error=") &&
      error.message.includes("not available"),
  );
  assert.deepEqual(action.calls, []);
});

test("Google sign-in starts PKCE using the same browser origin", async () => {
  const action = actionHarness({ origin: "http://localhost:3100" });
  await assert.rejects(
    action.run(),
    (error) => error.url === "https://project.supabase.co/auth/v1/authorize",
  );
  assert.deepEqual(action.calls[1], {
    provider: "google",
    options: { redirectTo: "http://localhost:3100/auth/callback" },
  });
});

test("failed initiation stays on the login page with a retry message", async () => {
  const action = actionHarness({ authorizationUrl: null });
  await assert.rejects(
    action.run(),
    (error) =>
      error.url.startsWith("/login?error=") &&
      error.message.includes("try again"),
  );
});

function callbackHarness({
  domainAllowed = true,
  existingProfile = true,
  exchangeError = null,
} = {}) {
  const calls = [];
  const user = { id: "current-user", email: "student@example.test" };
  const client = {
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.push(["exchange", code]);
        return { error: exchangeError };
      },
      getUser: async () => {
        calls.push(["user"]);
        return { data: { user } };
      },
      signOut: async (args) => {
        calls.push(["signOut", args]);
        return {};
      },
    },
    from: (table) => {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: (column, id) => {
            assert.equal(column, "id");
            assert.equal(id, user.id);
            return {
              maybeSingle: async () => ({
                data: existingProfile ? user : null,
              }),
            };
          },
        }),
        update: (value) => ({
          eq: async (column, id) => {
            calls.push(["update", id, value]);
            return {};
          },
        }),
        insert: async (value) => {
          calls.push(["insert", value]);
          return {};
        },
      };
    },
  };
  const callback = loadSource("../src/app/auth/callback/route.ts", {
    "@/utils/supabase/server": {
      createClient: async () => {
        calls.push(["client"]);
        return client;
      },
    },
    "@/utils/domain": {
      resolveEmailDomainStatus: async () => ({ isAllowed: domainAllowed }),
    },
    "@/utils/google-auth": authHelpers,
  }).GET;
  return { callback, calls };
}

test("callback exchanges the authorization code without requiring an ID token", async () => {
  const { callback, calls } = callbackHarness();
  const response = await callback(
    new Request(
      "https://preview.test/auth/callback?code=valid-code&next=%2Fsaved",
    ),
  );
  assert.equal(response.headers.get("location"), "https://preview.test/saved");
  assert.deepEqual(calls.slice(0, 3), [
    ["client"],
    ["exchange", "valid-code"],
    ["user"],
  ]);
  assert.equal(calls[3][0], "update");
  assert.equal(calls[3][1], "current-user");
});

test("callback rejects external return URLs and preserves account activation behavior", async () => {
  const existing = callbackHarness();
  const safeResponse = await existing.callback(
    new Request(
      "https://semester.test/auth/callback?code=valid&next=%2F%2Fexternal.test",
    ),
  );
  assert.equal(safeResponse.headers.get("location"), "https://semester.test/");
  const pending = callbackHarness({
    existingProfile: false,
    domainAllowed: false,
  });
  const pendingResponse = await pending.callback(
    new Request("https://semester.test/auth/callback?code=valid"),
  );
  const location = new URL(pendingResponse.headers.get("location"));
  assert.equal(location.pathname, "/login");
  assert.equal(
    location.searchParams.get("error"),
    "Your account is pending activation.",
  );
  assert.ok(pending.calls.some(([name]) => name === "signOut"));
});

test("bad OAuth callbacks cannot proceed to a profile write", async () => {
  const missing = callbackHarness();
  const response = await missing.callback(
    new Request("https://semester.test/auth/callback"),
  );
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");
  assert.deepEqual(missing.calls, []);
  const failed = callbackHarness({
    exchangeError: { message: "Expired authentication code" },
  });
  await failed.callback(
    new Request("https://semester.test/auth/callback?code=expired"),
  );
  assert.deepEqual(failed.calls, [["client"], ["exchange", "expired"]]);
});

test("legacy callback delegates to the same PKCE handler", () => {
  const handler = () => {};
  const legacy = loadSource("../src/app/google/callback/route.ts", {
    "@/app/auth/callback/route": { GET: handler },
  });
  assert.equal(legacy.GET, handler);
});

test("pending login submissions are disabled to avoid replacing the PKCE verifier", () => {
  const { SubmitButton } = loadSource("../src/components/submit-button.tsx", {
    "react-dom": { useFormStatus: () => ({ pending: true }) },
    "@/components/ui/button": { Button: () => null },
  });
  const button = SubmitButton({
    children: "Sign in with Google",
    pendingText: "Connecting…",
  });
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, "Connecting…");
});
