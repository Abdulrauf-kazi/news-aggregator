# Source audit (Phase 1)

Status: **code audit complete. Live feed checks run on 2026-11-03 (≈17:40–18:00 UTC). App-level checks (DB, `/api/fetch-article`, rendered pages) not yet run.**

Evidence tags:

- **C**: certain from the code path (file and line given).
- **L**: **live-tested** on 2026-11-03. I fetched the real feed or API in the desktop app's built-in browser, from your PC's network, and applied the app's own URL-selection rule (`url = <source url> || <link>`) to the raw items. Results are in "Live feed results" below.
- **Q**: reported in your earlier QA run, and consistent with the code.
- **H**: still a hypothesis. `scripts/audit-sources.ts` checks it once the dev server runs.

**What was not tested, and why.** Your PC has no free disk space for the command environment (it needs about 17 GB), and the `F:\NewsAggregator` folder is empty. So the dev server, MongoDB and `/api/fetch-article` could not be run. These remain unmeasured:

- full-text length per source;
- server-side bot blocking (401/403), which a real browser gets past and a server fetch doesn't;
- stored story ages and topics;
- the rendered article pages.

`scripts/audit-sources.ts` measures all of these.

`tmp-live.json` in the repo root is a snapshot from 2026-05-17, taken before the October fixes (it contains 26 fallback placeholder stories). It does not describe the current pipeline and is not used here.

## Live feed results (2026-11-03)

"App would store" applies the exact rule at `source-adapters.ts:186-188` to the first 10 raw items, which is what the adapter ingests.

| Source(s) | Feed result | App would store | Key finding |
|---|---|---|---|
| **BBC** (`rss-atom`) | 200 `text/xml`, 31 items, 0 without date, no `<source>` | **10/10 article URLs** | Baseline confirmed. `<link>` is the article. Description is a 104–152 character standfirst. |
| **All 18 Google News search sources** (Reuters, Bloomberg, Al Arabiya, Aaj Tak, WION, NDTV, Yahoo Finance, FRED, ACLED, UCDP, UNHCR, FAA, AIS, abuse.ch, OTX, AbuseIPDB, C2Intel, USASpending) | 200, 9–10 items each, every `<link>` a `news.google.com/rss/articles/…` wrapper | **0 article URLs: 179/179 homepage** (`<source url>`) | Root cause R1 confirmed. Description equals the headline in 178/179 items, so there is no real summary. |
| Google News decode (two-step `data-n-a-sg` + `batchexecute`) | Run from news.google.com in the browser | **31/31 decoded** to real article URLs (Reuters 5/5, 2 each for 13 more sources) | Fix for R2 is feasible. Not yet tested from a **server** (Node fetch has no cookies or consent), so Phase 2 must measure it there. |
| Aaj Tak | — | Decodes to `aajtak.in/vertical-livetv` and `/topic/cobra` | Live-TV promo and a topic page, both confirmed junk. 5/10 items are more than 7 days old (oldest 171 days). |
| Stale keyword searches | — | — | Items more than 7 days old: ACLED 10/10 (max 693 d), UCDP 10/10 (883 d), FAA 10/10 (651 d), AlienVault 10/10 (4,507 d), C2Intel 10/10, USASpending 9/9 (4,191 d), AbuseIPDB 9/10, abuse.ch 8/10, UNHCR 7/10, AIS 7/10 (2,016 d), FRED 6/10. Real dates exist, but there is no max age, so these get stored. |
| **X** (`x`) | Endpoint is Google News **XML** (200), so the generic adapter's `res.json()` throws (`Unexpected token '<'`) | Fallback searches "X (Twitter)" | Off-topic: Nevada senators, Britannica, Page Six, Yahoo Sports. The configured endpoint itself is 10/10 more than 7 days old (up to 1,447 d). |
| **Telegram** (`telegram`) | Same as X | Fallback searches "Telegram" | Off-topic: *Star-Telegram*, *telegram.com* (Worcester), a Syracuse stationery shop. |
| Polymarket, OpenSky, GDELT, Finnhub, EIA fallbacks | Google News search for the source label | Homepages | OpenSky's fallback returns **OpenSky credit-card** reviews (Credit Karma). The GDELT fallback is 10/10 more than 7 days old. |
| **France 24** | 200 `application/rss+xml`, 24 items, all dated today | **2/10 image URLs** (`s.france24.com/media/display/…jpg`) and 8/10 articles | Root cause confirmed: France 24 puts the **photo URL in `<source url>`**, and the app takes it over the correct `<link>`. Some items are `/video/` and `/tv-shows/` pages, which have little text. |
| **CNN** | 200, 50 items. Channel `pubDate` is **5 Apr 2023**, `lastBuildDate` 22 Aug 2024 | Article URLs from 2023 | **The feed is abandoned.** 4/50 items have no `pubDate` (the live-news `…-04-03-23` pages), and those get stamped "now". Others carry real 2023 dates. |
| **WSJ** | 200, 20 items, `lastBuildDate` **27 Jan 2025** | Article URLs | **The feed is abandoned.** Every item is 645–648 days old. It is also paywalled. |
| Guardian | 200 RSS, `<link>` is the article, no `<source>` | Article URLs | BBC-like. The description has several real paragraphs. |
| Sky News | 200 RSS, dated items, article links | Article URLs | BBC-like. |
| Al Jazeera | 200 RSS, 25 items, all dated today, no `<source>` | Article URLs | BBC-like. The first items are `/video/` pages with a short (70–80 character) description. |
| BIS | 200, **RSS 1.0 (RDF)**, 50 items, **0 `pubDate`, 50 `dc:date`** | Article (speech) URLs | `rss-parser` maps `dc:date` to `isoDate`, so dates are likely fine. **Not executed** (the package registry was unreachable from my workspace). |
| **GDELT** | **HTTP 429**, plain text "Please limit requests to one every 5 seconds", no content-type, about 12 s per response | — | Root cause confirmed. Three parallel queries all got 429 after about 12 s, longer than the 8 s timeout. `requestJson` fails, then the Google News fallback runs. One request spaced 8 s later still got 429 (your IP may be temporarily throttled). |
| **Polymarket** | **Navigation failed**: the browser couldn't load `gamma-api.polymarket.com` from your network, twice | — | Fits "times out every run". This looks like network-level blocking (Polymarket is restricted in some regions or by some ISPs), not just a missing `limit` parameter. A code fix may not help; this needs a decision. |
| **NWS** | 200, 400 active alerts. `id` URL is `application/geo+json` | `url = id`, a **JSON API URL** | Confirmed. `areaDesc` (e.g. "Bossier, LA; Caddo, LA") and `headline` exist but are unused. Event mix: 192 "Small Craft Advisory", 96 "Gale Warning", 46 "Flood Warning". With 10 items taken, the feed is near-certain to be dominated by identical titles. |
| **OpenSky** | 200 JSON. `states` is **an array of arrays** (`["39de47","TVF11KJ ","France",…]`) | No title, URL or date | Confirmed. The generic adapter gives "OpenSky Signal N", stamped now, with no URL. |

Not checked live, because the code alone settles the issue or I limited the number of site approvals: CNBC, Cloudflare blog, RSS2JSON, Hacker News, GitHub, arXiv, Finnhub, CoinGecko, EIA, USGS, NASA EONET.

### Corrections to the code-only table below, from the live results

- **WSJ**: the feed is **abandoned** (Jan 2025), not just paywalled. The decision is to drop it, or to replace it with a decoded Google News `site:wsj.com` search.
- **CNN**: `edition.rss` is **abandoned** (Apr 2023). The decision is to drop it, or to replace it with a decoded Google News `site:cnn.com` search.
- **France 24**: only about 2/10 items per fetch are images (your QA run saw 5/9). The cause is France 24's misuse of `<source url>`, not a media element.
- **Polymarket**: blocked or unreachable from your network. A code change probably won't fix it.
- **GDELT**: confirmed rate-limited (429, plain text, about 12 s).

## Sources: 46 defined

`lib/sources.ts` defines 46 sources. Each one maps to an adapter in the `adapters` table (`lib/source-adapters.ts:878-926`), or falls through to `fetchGenericStories`:

| Path | Count | Sources |
|---|---|---|
| Direct publisher RSS, via `fetchRssStories` | 10 | guardian, wsj, cnn, skynews, france24, aljazeera, cnbc, rss-atom (BBC), bis, cloudflare-radar |
| **Configured endpoint is a Google News search**, via `fetchRssStories` | 18 | alarabiya, reuters, aajtak, wion, ndtv, bloomberg, yahoo-finance, fred, acled, ucdp, unhcr, faa, ais, abusech, alienvault-otx, abuseipdb, c2intelfeeds, usaspending |
| No adapter, so the generic JSON parser runs | 4 | x, telegram (both endpoints are Google News **XML**), polymarket, opensky |
| Dedicated API adapter | 14 | rss2json, gdelt-conflict, gdelt-tech, gdelt-eco, gdelt-climate, hacker-news, github, arxiv, finnhub, coingecko, eia, usgs, nasa-eonet, nws |

The Insights and Network pages show different numbers because they count different things. Insights counts sources that have at least one story in the current graph (`app/insights/page.tsx:118`). Network counts `SOURCE_DEFINITIONS` and the stored source metrics.

`fetchFredStories` (`source-adapters.ts:335`) is dead code. The adapter map sends `fred` to `fetchRssStories` on a Google News search.

## BBC baseline: why BBC works

BBC works because its feed data happens to suit the pipeline, not because the pipeline is robust:

1. **URL.** BBC's RSS `<item>` has no `<source>` element, and its `<link>` points to the article itself. `extractXmlSourceUrls` (`source-adapters.ts:151-168`) therefore falls through to the `<link>` text, so `publisherUrl === item.link`. The faulty rule `url = publisherUrl || item.link` (line 188) yields the right answer by coincidence. **C**, plus **H** for the feed shape.
2. **Date.** Every item has a `pubDate`, so `isoDate` is used and the `new Date()` fallback in `createStory` (line 143) never triggers. **C/H**
3. **Summary.** `<description>` is a plain-text standfirst, so `content` is a real summary rather than a copy of the headline. **H**
4. **Article page.** `article-client.tsx:152` uses `story.publisherUrl` (the article URL). The resolver returns it as-is because `needsResolution` is false. `/api/fetch-article` gets a normal HTML page with no bot wall, and Readability extracts the body along with `og:image`, `og:site_name` and `article:published_time`. **C**, plus **H** that BBC serves this user agent.
5. **Topic.** This comes from the keyword classifier and then the MLP head (`topic-classifier.ts:264`), same as every other source.

BBC never reaches the content-type check, homepage detection, Google News decoding or the error notice, because none of those exist. Every source whose data differs from BBC's falls into a gap. RSS2JSON ingests the **same BBC feed** a second time. It merges with BBC only when both copies have embeddings, because `canonicalizeStories` skips stories without them (line 837).

## Per-source table

"Mode (expected)" is what `fetchStoriesForSource` will record given the code path. The ingestion report's `live` label is **not** reliable (see root cause R5).

| # | Source (id) | Mode (expected) | URL quality | Full-text status | Issues | Root cause | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | BBC World (`rss-atom`) | live | article | full | Reference. The second copy arrives through rss2json. | — | C/H |
| 2 | The Guardian (`guardian`) | live | article (`<link>`) | expected full | Probably near BBC-level already | Same path as BBC | H |
| 3 | WSJ World (`wsj`) | live, if the feed still updates | article | paywall: summary only, **no notice** | Paywalled. The feed may be stale. | Paywall, and notice suppressed when `story.content` exists (`article-client.tsx:170`) | H |
| 4 | CNN World (`cnn`) | live | article | varies | 2023 stories stamped "now" | Stale `edition.rss` feed. Missing `pubDate` falls back to `new Date()` (`createStory` line 143). No max-age filter. | Q, C |
| 5 | Sky News (`skynews`) | live | article | expected full | — | Same path as BBC | H |
| 6 | France 24 (`france24`) | live | **image URL (5/9)** | garbage: image bytes rendered as text, page overflows horizontally | Raw image as article text | `publisherUrl` wins over `item.link` (line 186-188). The image URL comes from whatever `extractXmlSourceUrls` matches. `fetch-article` has no content-type check (`route.ts:44`). | Q, C. Which element supplies the .jpg is H; the script prints the raw item. |
| 7 | Al Jazeera (`aljazeera`) | live | article | unknown: may be bot-blocked | — | Same path as BBC | H |
| 8 | CNBC (`cnbc`) | live | article | expected full, except Pro paywalled items | — | Same path as BBC | H |
| 9 | BIS (`bis`) | live | article (speech page) | expected full | Dates may be "now" if the feed uses `dc:date` | RSS 1.0 date field not mapped | H |
| 10 | Cloudflare Radar (`cloudflare-radar`) | live | article | expected full | Label is wrong: this is the Cloudflare **blog**, not Radar | Source definition | C |
| 11 | Reuters (`reuters`) | **labelled live; actually Google News** | **homepage** | homepage, or 401 with summary only and no notice | Homepage as story URL | R1, R2, R3, R5 | Q, C |
| 12 | Bloomberg (`bloomberg`) | labelled live; actually GN | homepage | 403 → summary only, no notice | Paywall plus homepage | R1, R2, R3, R5 | Q, C |
| 13 | Al Arabiya (`alarabiya`) | labelled live; actually GN | homepage | 403 → summary only, no notice | — | R1, R2, R3, R5 | Q, C |
| 14 | Aaj Tak (`aajtak`) | labelled live; actually GN | homepage | homepage text | Live TV promo in feed | R1, R2, R5, R6 | Q, C |
| 15 | WION (`wion`) | labelled live; actually GN | homepage | homepage text | — | R1, R2, R5 | Q, C |
| 16 | NDTV (`ndtv`) | labelled live; actually GN | homepage | homepage text | — | R1, R2, R5 | Q, C |
| 17 | Yahoo Finance (`yahoo-finance`) | labelled live; actually GN | homepage | homepage text | — | R1, R2, R5 | Q, C |
| 18 | FRED (`fred`) | labelled live; actually GN search "Federal Reserve economic data release" | homepage | "Federal Reserve Economic Data" (homepage) | Not FRED data | R1, R2, R5. The real `fetchFredStories` is never called. | Q, C |
| 19 | ACLED (`acled`) | labelled live; actually GN | homepage | homepage or summary | News *about* ACLED, not ACLED data | R1, R2, R5, definition | C |
| 20 | UCDP (`ucdp`) | labelled live; actually GN | homepage | homepage or summary | Same as ACLED | R1, R2, R5, definition | C |
| 21 | UNHCR (`unhcr`) | labelled live; actually GN | homepage | homepage or summary | Same as ACLED | R1, R2, R5, definition | C |
| 22 | FAA (`faa`) | labelled live; actually GN | homepage | homepage or summary | Same as ACLED | R1, R2, R5, definition | C |
| 23 | AIS Vessels (`ais`) | labelled live; actually GN | homepage | homepage or summary | Generic shipping news, not AIS | R1, R2, R5, definition | C |
| 24 | abuse.ch (`abusech`) | labelled live; actually GN | homepage | homepage or summary | Generic malware news | R1, R2, R5, definition | C |
| 25 | AlienVault OTX (`alienvault-otx`) | labelled live; actually GN | homepage | homepage or summary | — | R1, R2, R5, definition | C |
| 26 | AbuseIPDB (`abuseipdb`) | labelled live; actually GN | homepage | homepage or summary | — | R1, R2, R5, definition | C |
| 27 | C2IntelFeeds (`c2intelfeeds`) | labelled live; actually GN | homepage | homepage or summary | — | R1, R2, R5, definition | C |
| 28 | USASpending (`usaspending`) | labelled live; actually GN | homepage | homepage or summary | — | R1, R2, R5, definition | C |
| 29 | X (`x`) | google-news-fallback | homepage | homepage or summary | Off-topic (NASCAR). `SyntaxError: Unexpected token '<'` | No adapter, so `requestJson` runs on Google News **XML** (line 599). The fallback then searches the label "X (Twitter)" (line 214). | Q, C |
| 30 | Telegram (`telegram`) | google-news-fallback | homepage | homepage or summary | Off-topic (Worcester Telegram obituary) | Same as X | Q, C |
| 31 | Polymarket (`polymarket`) | google-news-fallback | homepage | homepage or summary | Times out on every run. The fallback feed duplicates "hack" stories ×4. | Generic adapter fetches all of `gamma-api…/markets` (no `limit` or `active` filter) inside an 8s timeout (line 22, 76). Even when it succeeds, markets have `question`, not `title`, so items would be titled "Polymarket Signal N" with no URL. | Q, C |
| 32 | OpenSky (`opensky`) | live (!) | missing | fallback blurb | 10× "OpenSky Signal N" | Generic adapter: `states` is an array of arrays, so there is no title, URL or time. The title becomes `${label} Signal ${idx+1}` and the time becomes "now" (line 632, 646). | Q, C |
| 33 | RSS2JSON (`rss2json`) | live | article | full (BBC) | Duplicates BBC | Ingests the BBC feed again through a third party | C |
| 34-37 | GDELT ×4 (`gdelt-*`) | google-news-fallback | homepage after fallback | homepage or summary | Silent fallback. The fallback searches "GDELT (Conflict)" etc. | `requestJson` fails. Likely GDELT's rate limit of about 1 request per 5s (four feeds fire in parallel) returns plain text instead of JSON. Also `seendate` (`YYYYMMDDTHHMMSSZ`) is not matched by `toIsoTimestamp` (line 53), so it would become "now". | Q (fallback), H (cause) |
| 38 | Hacker News (`hacker-news`) | live | article (external) or HN item | varies by site | Software stories forced into "AI" (tag `technology` → AI) | Topic mapping (R8) | C |
| 39 | GitHub (`github`) | live | repo page | README text | `PushEvent on …` junk | The adapter turns raw events into "stories" (line 449) | Q, C |
| 40 | arXiv (`arxiv`) | live | abstract page | partial (abstract) | No summary stored | The regex reads only id, title and published (line 464) | C |
| 41 | Finnhub (`finnhub`) | google-news-fallback if `FINNHUB_API_KEY` is missing | homepage (fallback) | homepage or summary | Silent fallback | A missing key throws (line 298), and the error is swallowed into the GN fallback | Q, C |
| 42 | CoinGecko (`coingecko`) | live | coin page | coin page text | "X trending in crypto markets" stubs, always stamped "now" | Synthetic titles. `new Date()` is hard-coded (line 502). | Q, C |
| 43 | EIA (`eia`) | google-news-fallback if `EIA_API_KEY` is missing | homepage (fallback). With a key, the **API endpoint** (JSON) | "Home", or JSON | EIA inventories ×3 | Without a key: swallowed error, then GN. With a key: titles are "EIA Energy Metric …" and `url = source.endpoint` (line 391). | Q, C |
| 44 | USGS (`usgs`) | live | event page | little text (the page is rendered by JavaScript) | Fine as data. No honest notice. | No summary built from magnitude and place | C/H |
| 45 | NASA EONET (`nasa-eonet`) | live | external source URL | varies | No summary | — | C |
| 46 | NWS (`nws`) | live | **API URL** (`api.weather.gov/alerts/…`, JSON) | JSON or garbage. The summary shows, with no notice. | "Tornado Warning" ×N with no location | `url = alert.id` (line 589). The title uses only `event` and ignores `areaDesc`. Same-source items never merge (line 813-819). | Q, C |

### Sources that cannot reach BBC level without a decision from you

- **Paywalled or bot-blocking publishers:** WSJ, Bloomberg, Reuters (401), Al Arabiya (403), and possibly Al Jazeera. Once the URL is fixed, these can reach "real article URL + honest notice". Full text needs either a licence or accepting the summary.
- **Named after an organisation but actually a Google News keyword search:** ACLED, UCDP, UNHCR, FAA, AIS, abuse.ch, AlienVault OTX, AbuseIPDB, C2IntelFeeds, USASpending, FRED, plus X and Telegram (there is no public X or Telegram API without keys). For each one, you can keep it relabelled honestly (for example "News about ACLED"), switch it to the organisation's own feed or API, or disable it.
- **Data APIs, not articles:** EIA, USGS, NWS, OpenSky, Polymarket, CoinGecko and GitHub produce events or metrics with no article page. They can reach "real event page + correct date + honest notice", but never "full article".

## Root causes (shared across sources)

- **R1. URL capture.** `source-adapters.ts:186-188` and `221-223` set `url = publisherUrl || item.link`. In Google News feeds `publisherUrl` is `<source url>`, which is the publisher's homepage, so the real per-item link is discarded. In other feeds it can match a media element. Neither the URL kind nor its content type is checked. **C**
- **R2. No Google News decoding.** Nothing decodes `news.google.com/rss/articles/…`. The resolver returns `publisherUrl` as soon as it isn't a wrapper or feed URL (`article-url-resolver.ts:98-100`), and a homepage passes that test. Its DuckDuckGo fallback is therefore never reached for these stories. `article-client.tsx:121,152` puts `publisherUrl` ahead of the resolver result. **C**
- **R3. Fetcher and notice.**
  - `fetch-article/route.ts` reads any response with `response.text()`. It has no content-type check, no size cap and no homepage or section detection.
  - Strategies 3 and 4 return whatever text exists. Failures come back as HTTP 200 with an `error` field.
  - The client hides the notice whenever `story.content` exists (`article-client.tsx:156,170,173`). For Google News items `content` is only "headline + outlet name", so the page repeats the headline and says nothing about the failure.
  - The body container doesn't constrain long unbroken text, so raw bytes overflow the page. **C/Q**
- **R4. Timestamps.** A missing or unparseable date becomes `new Date()` in `toIsoTimestamp` (lines 40, 50, 67) and in `createStory` (line 143). CoinGecko is hard-coded to now. There is no max age at ingestion or read time. `mergeAndStoreStories` upserts and never expires anything, so a stale item stamped "now" sorts to the top. **C**
- **R5. Dishonest health reporting.**
  - The 18 sources configured with a Google News search URL succeed in `fetchRssStories`, so they are logged as `live`.
  - Adapter errors inside `fetchRssStories`, `fetchGoogleNewsRssStories` and `fetchGenericStories` are caught and turned into `[]`. The real error (`SyntaxError`, timeout, missing key) never reaches the metric. The source then shows `google-news-fallback` with `ok: true`.
  - OpenSky's junk counts as `live`. **C**
- **R6. No quality gate.** `isSyntheticStory` only catches the old fallback copy and the case of a root URL with more than two sources. Nothing filters "Signal N", `*Event on`, "trending" stubs or live-TV promos. **C**
- **R7. Dedupe.**
  - Merging is vetoed for any two items from the same source (lines 813-819). For Google-News-backed "sources", items from different outlets about the same event are therefore never merged.
  - Stories without embeddings skip dedupe entirely (line 837).
  - NWS titles carry no area, so different alerts look identical. **C/Q**
- **R8. Topics.** There are 8 fixed `TOPICS` and no "Other". For every story in its embedding space, the MLP head (`topic-classifier.ts:264`) overrides the keyword topic with its arg-max, without a confidence threshold. When there is no keyword evidence, the category default applies (news → Geopolitics). Off-topic or junk items are always forced into one of the 8. **C/Q**

## Proposed fix plan (Phase 2, awaiting your go-ahead)

In your priority order. File names are relative to `apps/web`.

1. **Ingestion URLs** (`lib/source-adapters.ts`, new `lib/article-url.ts`)
   - Add a shared `classifyStoryUrl()` that labels a URL as article, homepage, section, media, feed, api or Google News wrapper. Use it at ingestion and in the fetcher. The same rules already run in the audit script.
   - Set `url` from the item's own `link` and only accept it if it classifies as an article. Use `publisherUrl` only for the outlet's name and homepage.
   - **Decode Google News links** with the unofficial two-step decode: fetch the article page to get its `data-n-a-sg` and `data-n-a-ts` values, then call Google's `batchexecute` endpoint. Concurrency is limited and decoded URLs are cached in Mongo. If a link can't be decoded, keep the Google News link and set `articleUnavailable: true`. This method is undocumented and may be rate-limited; I'll measure the success rate rather than assume it works.
2. **Fetcher** (`app/api/fetch-article/route.ts`, `lib/article-url-resolver.ts`)
   - Accept HTML content types only and cap the body at about 3 MB.
   - Reject homepage and section pages, by URL and by having no article body.
   - Use Readability output only when it has at least about 600 characters of text and several paragraphs.
   - Otherwise fall back to the feed's `content:encoded` or description. This means storing the longer feed text at ingestion.
   - Always return an explicit `status`: `ok`, `paywalled`, `blocked`, `not-html`, `homepage`, `too-short` or `error`.
   - The resolver stops returning homepages and returns `{ url, verified }`.
3. **Article page** (`app/news/[slug]/article-client.tsx`)
   - Use URLs in this order: verified resolver URL, then `story.url`, then the Google News link; `publisherUrl` is never used as the article URL.
   - Show the notice whenever full text is missing, including summary-only pages.
   - Never label a homepage as "Original source".
   - Add `min-w-0`, `overflow-wrap:anywhere` and `max-w-full` on images, tables and `pre` elements so no page can scroll sideways.
4. **Quality gate** (`lib/story-quality.ts`, adapters)
   - Drop Signal-N, GitHub events, trending stubs and live-TV promos.
   - Never stamp "now": use the item's date, then the feed's date, and otherwise drop the item.
   - Apply a max age at ingestion and at read time. I propose 7 days for news and 2 days for alerts.
   - Fix X and Telegram, or disable them (decision below).
5. **Broken sources**
   - Give X and Telegram the RSS adapter.
   - Polymarket: query `?limit=20&active=true&closed=false&order=volume24hr`, map `question` to the title and the market page to the URL, and add retry with backoff.
   - GDELT: run the four feeds one after another, 5 s apart, retry once, and parse `seendate`.
   - Finnhub and EIA: report a missing key as an error instead of silently falling back.
   - Make the ingestion table honest by adding the mode `google-news` and carrying the real error through.
6. **Dedupe and variety**
   - Allow same-source merges for sources backed by Google News.
   - Build NWS titles as "event — areaDesc", link to the alerts page, and cap the number of alerts per event type.
   - Add a "General" topic used when the topic head's confidence or margin is low. The 8 trained classes stay unchanged.
7. Re-run the audit script before and after, update this file with a before/after column for every source, and list what still isn't BBC-level.

## How to re-run the audit

1. Start the dev server: `bun run dev` in `apps/web`.
2. From `apps/web`, run `bun scripts/audit-sources.ts`. Optional flags:
   - `--sample 3` samples more article pages per source.
   - `--source france24,cnn` audits only those sources.
   - `--skip-articles` probes the feeds only.

The script is read-only. It never triggers ingestion and never writes to Mongo or Redis. It reads `MONGODB_URI` from `.env.local` without printing it, and redacts API keys. It writes `docs/source-audit.measured.md` and `.json`. On low memory it checks one article page at a time.
