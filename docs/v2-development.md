# Merlin v2 development

The illuminated Codex is being implemented alongside the original local explorer. The original `site/` app, Python renderer build, and collector tests remain intact. The new frontend uses React, TypeScript and Vite from the repository root.

## Local commands

Use a current Node.js release supported by the versions in `package-lock.json`.

    npm ci
    npm run dev

The development server binds to `http://127.0.0.1:5180`. The new frontend keeps imported history in tab memory; export prepared data before a refresh or closing the tab. A new import replaces the current local session rather than merging a previous session's archive. Files selected together are combined and exact duplicate source records are removed.

    npm test
    npm run build
    npm run preview

The production build is written to `dist/`; the preview server binds to `http://127.0.0.1:4180`.

Browser tests use Playwright and an installed Chrome executable. Set `MERLIN_CHROME_PATH` if Chrome is not at the default macOS application location.

    npm run test:e2e

Unit/component and browser tests use synthetic fixtures only. Test reports, browser screenshots and build outputs are ignored by Git. Personal archives and provider response caches must never be committed or put in `public/`.

## Legacy regression commands

The original app is still available by serving `site/` separately; it is not what Vite serves at the repository root.

    node tests/test-data.js
    node tests/test-enrichment-merge.js
    python3 tests/test-enrichment.py
    python3 tests/test-pacing.py
    python3 tests/test-browser.py
    python3 tests/test-review.py

The Python browser suites need the packages in `requirements-dev.txt` and either Playwright Chromium or `MERLIN_CHROME_PATH`. Retain the original import and exact-identity invariants when adapting old UI tests.

## Service boundaries

History import/export remains local-only and requires no API keys. Optional Google authentication is implemented through Supabase; see [Google authentication](google-authentication.md). A sign-in session is separate from listening history. Consent records, cloud saving, server-side enrichment, AI responses and reminder emails remain unavailable. Disabled controls must explain their unavailable state; no simulated account, scheduled email or canned Oracle result is a substitute for an integration.

Do not put Supabase service-role credentials, AI provider secrets or enrichment keys in Vite environment variables. Browser-exposed configuration is public. Future backend code must independently enforce authentication, ownership, consent versions and resource limits.

V2 targets Cloudflare Workers Static Assets. See [the deployment guide](cloudflare-deployment.md) for the exact branch/build/Worker settings and test-address verification. `npm run deploy:check` validates the built assets using Wrangler's non-publishing dry-run; `npm run preview:cloudflare` runs the local Cloudflare runtime at port 8788 after a build.

The existing `netlify.toml` still describes the original ready-built `site/` deployment and is left unchanged. Do not attach a production domain merely to test the new frontend. The new frontend does not register the old app's service worker. Any later cloud release needs its own tested auth callbacks, privacy wording and cache policy.

## Supabase connection checklist — later milestone

Creating an account is sufficient to begin. Before provisioning a project, confirm its region and budget with the owner. Before accepting real cloud histories:

- Enable Google authentication with exact development/preview/production redirect allowlists and approved Google branding.
- Review the Privacy Policy and Data Use Agreement and record server-side, versioned agreement timestamps.
- Apply database row-level security and private storage policies before use; test isolation with two distinct accounts and direct API requests.
- Design source-aware, privacy-preserving identity for overlapping imports. The old prepared event tuple alone does not carry all fields used for exact original-record deduplication.
- Define staging retention, durable job execution, retry safety, export, account/data deletion and backup expiration.
- Check rights for provider-data retention, reuse and AI processing. A working endpoint or user consent alone does not establish all necessary permissions.
- Keep private production data, secrets and experimental provider caches out of the public repository.

The milestone-specific verification results belong in the private build handoff, not in this document as an unverified standing claim.
