"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import {
  getGoogleCallbackUrl,
  getGoogleProviderStatus,
} from "@/utils/google-auth";
import { encodedRedirect } from "@/utils/utils";

export const signInWithGoogleAction = async () => {
  const providerStatus = await getGoogleProviderStatus(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (providerStatus !== "enabled") {
    return encodedRedirect(
      "error",
      "/login",
      providerStatus === "disabled"
        ? "Google sign-in is not available yet. Please try again later or continue with email."
        : "We couldn’t connect to Google sign-in. Please try again.",
    );
  }

  let redirectUrl: string;
  try {
    redirectUrl = getGoogleCallbackUrl(
      (await headers()).get("origin"),
      process.env.NEXT_PUBLIC_BASE_URL,
    );
  } catch {
    return encodedRedirect(
      "error",
      "/login",
      "Google sign-in is not configured correctly.",
    );
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error || !data?.url) {
    console.error(
      "Error initiating Google sign-in:",
      error?.message ?? "Missing authorization URL",
    );
    return encodedRedirect(
      "error",
      "/login",
      "Couldn’t start Google sign-in. Please try again.",
    );
  }

  return redirect(data.url);
};
