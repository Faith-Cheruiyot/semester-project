import { NextResponse } from "next/server";

import { resolveEmailDomainStatus } from "@/utils/domain";
import { createClient } from "@/utils/supabase/server";
import { getSafeAuthReturnPath } from "@/utils/google-auth";

export const GET = async (request: Request) => {
  const requestUrl = new URL(request.url);

  // Extract URL parameters
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Keep the session on the same host that received its PKCE verifier cookie.
  const origin = requestUrl.origin;

  // Check for OAuth provider errors
  if (error) {
    console.error(`OAuth Error: ${error} - ${errorDescription}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        errorDescription || "Authentication failed",
      )}`,
    );
  }

  // Check for code parameter
  if (!code) {
    console.error("No code parameter found in callback URL");
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "Authentication code missing",
      )}`,
    );
  }

  try {
    const supabase = await createClient();

    // Enhanced error handling for code exchange
    try {
      const { error: sessionError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (sessionError) {
        console.error("Error exchanging code for session:", sessionError);
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(sessionError.message)}`,
        );
      }
    } catch (exchangeError) {
      console.error("Exception during code exchange:", exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          "Error during authentication code exchange",
        )}`,
      );
    }

    // Check if the user is authenticated after code exchange
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Error getting user after code exchange:", userError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(userError.message)}`,
      );
    }

    if (!user) {
      console.error("No user found after code exchange");
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          "Authentication failed - No user found",
        )}`,
      );
    }

    if (!user.email) {
      console.error("Authenticated user missing email address:", user.id);
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Invalid email address")}`,
      );
    }

    const { isAllowed: isDomainAllowed, error: domainStatusError } =
      await resolveEmailDomainStatus(supabase, user.email);

    if (domainStatusError) {
      console.error(
        "Error resolving email domain status during login:",
        domainStatusError,
      );
    }

    try {
      const { data: existingProfile, error: profileQueryError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("id", user.id)
        .maybeSingle();

      if (profileQueryError) {
        console.error(
          "Error checking for existing profile:",
          profileQueryError,
        );
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent("Error checking profile")}`,
        );
      }

      if (existingProfile) {
        const { error: updateProfileError } = await supabase
          .from("profiles")
          .update({
            email: user.email,
            modified_by_user_id: user.id,
          })
          .eq("id", user.id);

        if (updateProfileError) {
          console.error("Error updating existing profile:", updateProfileError);
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(
              "Failed to refresh profile. Please try again.",
            )}`,
          );
        }
      } else {
        const { error: insertProfileError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            created_by_user_id: user.id,
            modified_by_user_id: user.id,
          });

        if (insertProfileError) {
          console.error("Error creating profile:", insertProfileError);
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(
              "Failed to create profile. Please try again.",
            )}`,
          );
        }

        if (!isDomainAllowed) {
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(
              "Your account is pending activation.",
            )}`,
          );
        }
      }
    } catch (profileError) {
      console.error("Exception during profile check/creation:", profileError);
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Failed to create profile")}`,
      );
    }

    // Check if there's a specific redirect path
    const redirectTo = getSafeAuthReturnPath(
      requestUrl.searchParams.get("redirect_to") ??
        requestUrl.searchParams.get("next"),
    );
    return NextResponse.redirect(new URL(redirectTo, origin));
  } catch (error) {
    console.error("Unexpected error in auth callback:", error);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Authentication failed")}`,
    );
  }
};
