# Google sign-in

The teaching-data Supabase project initially had the Google provider disabled. Its public Auth settings reported `external.google: false`, and starting Google OAuth returned HTTP 400, `Unsupported provider: provider is not enabled`.

The app now checks provider availability before redirecting, displays a login-page error when configuration or the Auth service is unavailable, disables repeat submissions during the redirect, and uses one PKCE callback handler for both callback paths. Successful callbacks stay on the initiating app host. Return paths cannot redirect outside the app. The legacy callback no longer requires a Google ID token in the URL or uses an admin key.

## Provider configuration

Create a **Web application** OAuth client in Google Cloud's Google Auth Platform → Clients. The client can live in the existing **Humor Project** Google Cloud project.

- Name: `Semester Project`
- Authorized JavaScript origin: `https://semester-project-murex.vercel.app`
- Authorized redirect URI: `https://jhjpnyjpeinienxtqdex.supabase.co/auth/v1/callback`
- Only basic sign-in scopes are needed: `openid`, `email`, and `profile`.

Enter the generated Client ID and Client secret directly into [Supabase's Google provider form](https://supabase.com/dashboard/project/jhjpnyjpeinienxtqdex/auth/providers?provider=Google), enable Google, and save. Do not commit the credentials or put the secret in a `NEXT_PUBLIC_` environment variable. The app uses the public Supabase key and the signed-in user's session.

In [Supabase URL Configuration](https://supabase.com/dashboard/project/jhjpnyjpeinienxtqdex/auth/url-configuration), use:

- Site URL: `https://semester-project-murex.vercel.app`
- Allowed redirect: `https://semester-project-murex.vercel.app/auth/callback`

Local or preview callback URLs must be explicitly allowed if those environments will be used for sign-in. Testing-mode audience restrictions in Google Cloud also apply; add intended test users there when needed. Existing app domain activation rules still apply after authentication.

References: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Google web OAuth clients](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

## Validation

- Regression tests cover disabled and unavailable providers, OAuth initiation, same-host callbacks, code exchange, safe return paths, existing activation behavior, and repeat submissions.
- `npm test`: 76 tests passed, including 11 Google auth regressions.
- Targeted ESLint checks and `npm run build` passed.
- Full sign-in requires the provider credentials above and a user completing Google's account and consent screens.
