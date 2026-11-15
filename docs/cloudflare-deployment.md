# Deploy the Codex preview to Cloudflare

This repository contains two applications: the original ready-built explorer in `site/` and the new React/Vite Codex at the repository root. Cloudflare must build the root application into `dist/`, not publish `site/`.

## What this deploys

The Codex keeps listening history in browser-tab memory. Google sign-in is optional and enabled only when the public Supabase build configuration is present at an approved origin. Cloud history saving, server enrichment, Oracle answers and reminder emails remain unavailable. Signing in sends basic Google profile information to Supabase and persists the authentication session in browser storage; it never uploads imported history. A successful static deployment does not establish a completed OAuth round trip.

`wrangler.json` configures a static-assets-only Worker called `merlinmusic`. No backend Worker source, database bindings, domains or DNS routes are provisioned by this file. The existing `netlify.toml` remains as the original app's historical configuration and is not the v2 hosting target.

## Git-connected setup

In the Cloudflare dashboard, use **Workers & Pages → Create application → GitHub**. Restrict the GitHub authorization to `PeanutRBuckle/merlin` where possible.

For the first test deployment, select these settings only after the current branch has been pushed and verified:

| Setting | Value |
| --- | --- |
| Repository | `PeanutRBuckle/merlin` |
| Worker/application name | `merlinmusic` — must match `wrangler.json` |
| Production branch for this test app | `feat/merlin-v2` — do not select the old `main` branch |
| Root directory | Clear this field completely and leave it blank; do not enter `site/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Static asset directory | `dist`, already declared in `wrangler.json` |
| Node version | `26.7.0`, pinned by `.node-version` |
| Package manager | `npm@11.19.0`, pinned in `package.json` |

The dashboard calls the selected branch its production branch. Here that means the branch deployed to this test Worker's public `workers.dev` address; it does not mean the custom domain has been attached or that this is a finished cloud product. Choose the free Workers tier for this initial static preview; no paid add-on is required by this configuration.

Cloudflare installs dependencies from the committed npm lockfile. Do not add a second dependency-install command unless diagnosing a verified install problem. If the dashboard defaults to a different Node version, check the build log and the `.node-version` override before deploying.

If you choose another application name, update `wrangler.json` to match before deploying; a name mismatch can fail the Git build.

## Variables and credentials

To enable optional Google sign-in, open Cloudflare → Workers & Pages → merlinmusic → Settings → Build → Build variables and secrets. Add both variables to this Git build environment (not the separate runtime Variables & Secrets section), then build the intended revision:

- `VITE_SUPABASE_URL`: the project's HTTPS API URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: its `sb_publishable_...` browser key.

Without these, file import and export still work and the sign-in control remains disabled. `.env.local` configures only local builds and is not sent to Cloudflare. See [Google authentication](google-authentication.md) for exact redirect URLs, scope/session handling and the real-user acceptance check.

Never add a Supabase secret/service-role key, database password, AI provider secret or personal history to browser-visible Vite variables, Git or `public/`. A `VITE_` prefix makes a value public, not secure. `.env.local` remains ignored and is not uploaded with the repository.

Cloudflare's Git integration handles its own deployment authorization. Do not put a Cloudflare API token into this frontend's environment or source.

## Local validation without publishing

    npm ci
    npm test
    npm run deploy:check

`deploy:check` builds the app and runs `wrangler deploy --dry-run`. It validates the deployable directory/configuration without creating a remote Worker or publishing anything.

To exercise the actual Cloudflare local runtime, build first, then run:

    npm run preview:cloudflare

It listens on `http://127.0.0.1:8788`. In another terminal:

    MERLIN_BASE_URL=http://127.0.0.1:8788 npm run test:e2e

The browser tests use synthetic history, not personal archives. Set `MERLIN_CHROME_PATH` when Chrome is not at the default macOS path. `public/_headers` preserves the static app's basic security headers on Cloudflare; Vite's ordinary preview server does not emulate those headers.

## Verify the hosted test address

After the Git build succeeds, obtain its exact `workers.dev` URL and source commit from Cloudflare. A green build alone is not the entire deployment check.

Verify:

- The source revision matches the intended pushed v2 commit.
- Landing artwork, self-hosted fonts, styles and the browser import worker load without console errors.
- Synthetic JSON/ZIP import, charts, date filtering, prepared export/reimport and error states work on desktop and mobile.
- Imported history is not posted to a server or written to persistent browser storage.
- Basic security headers are returned, and unavailable integrations stay clearly unavailable.
- No real listening data, private screenshots, source IPs or credentials appear in the deployed static assets.

Do not connect `merlinmusic.app` or alter unrelated/email DNS records until this test deployment is verified and the domain cutover is approved. Domain registration and website hosting are separate; no registrar transfer or nameserver change is needed merely to use this setup.

## Provider references

- https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- https://developers.cloudflare.com/workers/static-assets/get-started/
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
