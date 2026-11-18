type ProviderStatus = "enabled" | "disabled" | "unavailable";

export async function getGoogleProviderStatus(
  url: string | undefined,
  publishableKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ProviderStatus> {
  if (!url || !publishableKey) return "unavailable";
  try {
    const response = await fetcher(new URL("/auth/v1/settings", url), {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unavailable";
    const settings = await response.json();
    if (settings.external?.google === true) return "enabled";
    if (settings.external?.google === false) return "disabled";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export function getGoogleCallbackUrl(
  origin: string | null,
  fallback?: string,
): string {
  for (const value of [origin, fallback]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (
        !["https:", "http:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      ) {
        continue;
      }
      return new URL("/auth/callback", parsed.origin).href;
    } catch {
      // Use the configured application URL if the request did not provide an origin.
    }
  }
  throw new Error("Application URL is not configured.");
}

export function getSafeAuthReturnPath(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  try {
    const destination = new URL(value, "https://auth-return.invalid");
    return destination.origin === "https://auth-return.invalid" ? value : "/";
  } catch {
    return "/";
  }
}
