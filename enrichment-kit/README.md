# Merlin optional enrichment kit

This is an optional local workflow for a coding-capable LLM or a technical helper. Artist/song charts and the calendar need no enrichment. The kit uses Python's standard library and a catalog-only export; it never needs listening timestamps, IP fields, a Spotify login, or payment details.

## Recommended providers: two different capabilities

Use stats.fm for audio features. This was the successful, high-coverage audio source in the original project. It unlocks Sound spectrum and Sound clusters. Last.fm does not supply those numeric features through the tag endpoint.

Use Last.fm track.getTopTags for genre tags, with the supplied explicit taxonomy. This was the genre source used in the original project. It unlocks Genre map and its filters, but coverage is often poor. Do not run only the genre command and describe the file as fully enriched for all views.

First reuse valid, authorized local caches or earlier exports if available. Do not query providers again for data already collected. Do not alter an existing running collector/script/cache without its owner's approval.

## Missing matches are expected

Many real, well-known songs return empty Last.fm track tags; most tracks in the original full-library genre run were unclassified. This is not automatically a bad Spotify ID, nonexistent song or script failure. Keep empty outcomes cached and unknown; do not invent labels, lower thresholds merely to increase coverage, or silently substitute artist genres. A query being completed does not mean it returned usable enrichment. Fifty queries can produce more than fifty sidecar IDs because edition IDs share artist/title lookups, and can produce far fewer than fifty usable genres.

Missing audio features are a separate gap. Keep true zeros and leave missing values null. All eight numeric features are needed for a track to enter sound clustering. A genre-only file can enable Genre map but cannot enable the two audio views. A file with only empty tag results enables no new views; Merlin now explains this instead of merely saying the upload succeeded.

## Run a pilot, inspect the two results, then resume

1. Import history in Merlin → Enrich my data → Export track list.
2. Download/unzip this kit to a chosen local folder. Save merlin-track-list.json there.
3. Read enrichment-prompt.txt with a coding-capable LLM if desired. Ordinary chat alone cannot run the scripts. Never paste API keys into chat.
4. Review current provider terms and ask the user before making external calls. No endpoint, quota or continued public access is guaranteed.
5. Run the audio pilot:

    python3 enrich.py merlin-track-list.json --audio --limit 50

6. Configure LASTFM_API_KEY securely in the local environment, then run the genre pilot independently:

    python3 enrich.py merlin-track-list.json --genres --limit 50

7. Inspect exact-ID matches, complete audio tracks, usable genre tracks, empty outcomes, unmatched IDs and access failures separately. Don't judge success from file count or accepted upload alone. With approval, increase --limit for the remaining catalog; don't keep asking for tiny pilots indefinitely. Completed cache entries are skipped.
8. Export from cache without network calls at any time:

    python3 enrich.py merlin-track-list.json --export-only

9. Drop merlin-enrichment.json into Merlin's enrichment dialog. It reports what matched, what is usable, overall coverage, and which views are available. Partial sidecars add data without erasing existing values when fields are null/omitted. Export the updated prepared history to reuse later.

## Pacing: separate providers, no 1.5-second sleep per song

Last.fm: --tag-interval defaults to 0.3 seconds between request starts in this single-process collector. The earlier full-library collector used 0.26-second globally paced starts. These are local settings based on previous operation, not an official or guaranteed quota. Only the remaining gap is waited; a response that already took longer than the interval incurs no extra sleep. Do not run multiple collectors in parallel to multiply the rate.

stats.fm: --audio-interval defaults to 1.5 seconds between batch starts, up to 50 original IDs per request. It is not a per-song delay. There is no verified universal public numeric quota. Defaults are configurable; a legacy --interval overrides both intervals if explicitly supplied.

Current Last.fm API terms reserve dynamic rate limits at the provider's discretion; they do not require a universal 1.5-second pause. HTTP 429 Retry-After stops the collector and persists its cooldown. Last.fm API error 29 also stops and stores a conservative local 60-second backoff; that is not a promised provider reset time. Do not rotate clients/accounts/keys/IPs or hammer retries. Provider access failures are blockers, not an invitation to guess bypass routes.

These changes apply to this new kit. They do not modify a previously downloaded/running script. Do not replace that script or its cache mid-run without deciding how to stop/resume safely.

## Files, provenance and validation

Defaults: merlin-enrichment-cache.json and merlin-enrichment.json in the chosen working directory. Keep these private/out of Git. Different catalogs should use distinct cache/output paths. The cache retains raw stats.fm replies and Last.fm raw tag arrays, not credentials or key-bearing request URLs.

Contract: enrichment.schema.json. IDs are literal 22-character Spotify track IDs, kept separate across editions. Complete audio features: energy/danceability/valence/acousticness/instrumentalness/speechiness (0–1), loudness (-100 to 10 dB), tempo (0–400 BPM). Last.fm families use taxonomy.json, source-weight threshold 5; weights are not accuracy probabilities. Track-release, album-release and credited-artist labels remain distinct. Do not mix them into Last.fm track families.

Before delivery, check ranges, exact source IDs, missing/null handling, provenance, absence of credentials, and unchanged original event counts/integer duration totals after import. Report gaps honestly. A cache timestamp does not establish that the source metadata itself is fresh. No paid service is invoked automatically.

Provider references:
- https://beta-api.stats.fm/swagger/
- https://stats.fm/terms
- https://www.last.fm/api/show/track.getTopTags
- https://www.last.fm/api/tos

No provider collection is required to use the base Merlin app. No provider catalog data or listening history is bundled in this kit.
