# Optional Google authentication

Merlin is hosted on Cloudflare. Supabase handles accounts, and Google provides the basic sign-in identity. No Google Drive, Gmail, calendar, Spotify permissions, offline Google access or cloud history uploads are requested.

## Public build configuration

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) in ignored `.env.local` for local development and separately in Cloudflare's Git build variables for the hosted app. Only public browser configuration belongs here. Never use a Google client secret, Supabase administrative secret, service-role JWT, database password or AI provider key.

The frontend accepts managed Supabase HTTPS project URLs and publishable keys only. Missing/invalid config or an unapproved app origin disables sign-in without blocking local file import/export. Adding a domain requires an explicit frontend-origin and Supabase-allowlist update; domain registration alone is not setup.

## Redirects

Google's OAuth client's authorized redirect URI is the Supabase project's `/auth/v1/callback`, not the website URL. Keep Google's client secret exclusively in Supabase's protected Google-provider settings.

In Supabase Authentication → URL Configuration, allow the exact app return URL:

    https://merlinmusic.linequinn42.workers.dev/?auth_callback=1

For local testing, also allow only the origins actually in use:

    http://127.0.0.1:5180/?auth_callback=1
    http://127.0.0.1:4180/?auth_callback=1
    http://127.0.0.1:8788/?auth_callback=1

The SDK uses PKCE, requesting `openid email profile`. Start and finish in the same browser/device. Only one sign-in attempt should be active per browser profile; a later flow can overwrite an earlier verifier. The app explicitly exchanges the one-use query-string code, removes auth parameters from the address bar, and opens `#/account`. The SDK's automatic URL detection is disabled to avoid double exchange and conflicts with the hash router. Arbitrary `next` URLs are not followed.

## Session and history boundaries

Supabase persists/refreshes its authentication session in browser localStorage, separate from listening history, which stays in React tab memory. The frontend's profile display is not an authorization check for a backend operation. No database, storage, enrichment or AI request is made with listening data.

Identity changes (including sign-out and another-tab account changes) remount the local workspace, discarding imported history, picked files, stale import subscribers and page-local state. Token refresh for the same user does not clear the workspace. Export first if a copy is needed. Account sign-out warns before clearing bound history, signs out this browser session (`scope: local`) rather than every device, and does not pretend a failed sign-out succeeded.

Clearing local history does not sign out or delete the authentication account. Account deletion is not implemented; the project owner must handle requests administratively. Privacy Policy/Data Use Agreement remain drafts: no agreement is recorded. Keep Google OAuth limited to development/test users until required documents and account-management procedures are approved. Cloud history must remain disabled until versioned consent, per-user grants/RLS/private storage and two-user isolation are verified.

## Verification

    npm test
    npm run deploy:check
    npm run test:e2e

For an intentionally unconfigured browser build, run its tests with `MERLIN_AUTH_CONFIGURED=0`. Normal browser tests expect the public configuration. Unit tests suppress local environment configuration and use synthetic identity fixtures. Browser auth tests distinguish a real Supabase→Google authorization redirect from intercepted synthetic session tests. Neither proves a person completed OAuth.

Before calling authentication operational, complete Google sign-in with an approved test user at the actual hosted origin, verify return to Account, verify profile and reload persistence, then sign out and reload again. No history files are needed. Verify callback denial/retry too. A provider-enabled setting, HTTP 302, mock session or green build alone is not that acceptance check.

Google button artwork is unmodified from Google's pre-approved Android/Web light rectangular PNG bundle:
https://developers.google.com/static/identity/images/signin-assets.zip
Branding reference: https://developers.google.com/identity/branding-guidelines
Auth references: https://supabase.com/docs/guides/auth/social-sign-in/auth-google and https://supabase.com/docs/guides/auth/sessions/pkce-flow
