import type { Company } from "./types.ts";

// Seed watchlist. Personal, curate freely. Auto-detect-by-name is W4, not here.
export const REGISTRY: Company[] = [
  { name: "Anthropic", platform: "greenhouse", token: "anthropic", tier: 1 },
  { name: "Stripe", platform: "greenhouse", token: "stripe", tier: 1 },
  { name: "Figma", platform: "greenhouse", token: "figma", tier: 1 },
  { name: "Databricks", platform: "greenhouse", token: "databricks", tier: 1 },
  { name: "Discord", platform: "greenhouse", token: "discord", tier: 1 },
  { name: "Vercel", platform: "greenhouse", token: "vercel", tier: 1 },
  { name: "Palantir", platform: "lever", token: "palantir", tier: 1 },
  { name: "Ramp", platform: "ashby", token: "ramp", tier: 1 },
  { name: "Notion", platform: "ashby", token: "notion", tier: 1 },
  { name: "Linear", platform: "ashby", token: "linear", tier: 1 },
  { name: "Amazon", platform: "amazon", token: "amazon", tier: 2 },
  // Netflix's full board is ~485 roles (~49 subrequests, over the free-tier 50 cap).
  // Its new-grad SWE role is seasonal (posts Sep/Oct), so narrow the crawl with a
  // query — ~2 pages — which stays cheap and still catches the role when it drops.
  { name: "Netflix", platform: "eightfold", token: "netflix.com", host: "explore.jobs.netflix.net", query: "new grad", tier: 2 },
  // CoreWeave is on Greenhouse (271 jobs) — moved out of tier-3 browser rendering
  // into the cheap JSON sweep. No browser, no timeout.
  { name: "CoreWeave", platform: "greenhouse", token: "coreweave", tier: 1 },

  // Batch added 2026-08-13 (probed live against the JSON APIs, all return jobs).
  // Enterprise boards on Workday/custom (Microsoft, NVIDIA, Bloomberg, Capital One,
  // Cisco, ServiceNow, Lockheed, Northrop, IBM/Red Hat) + a few custom-ATS startups
  // (Canva, Rippling, Deel, Cohesity, Cyera, Checkout.com, Mistral, Clio, NinjaOne)
  // are NOT here — no cheap JSON endpoint, they'd need tier-3 browser scraping.
  { name: "Cloudflare", platform: "greenhouse", token: "cloudflare", tier: 1 },
  { name: "Datadog", platform: "greenhouse", token: "datadog", tier: 1 },
  { name: "Jane Street", platform: "greenhouse", token: "janestreet", tier: 1 },
  { name: "Vanta", platform: "ashby", token: "vanta", tier: 1 },
  { name: "Modal", platform: "ashby", token: "modal", tier: 1 },
  { name: "Huntress", platform: "greenhouse", token: "huntress", tier: 1 },
  { name: "Glean", platform: "greenhouse", token: "gleanwork", tier: 1 },
  { name: "Chainguard", platform: "greenhouse", token: "chainguard", tier: 1 },
  { name: "PostHog", platform: "ashby", token: "posthog", tier: 1 },
  { name: "Altruist", platform: "greenhouse", token: "altruist", tier: 1 },
  { name: "Pylon", platform: "ashby", token: "pylon", tier: 1 },
  { name: "Nooks", platform: "greenhouse", token: "nooks", tier: 1 },
  { name: "Retell AI", platform: "ashby", token: "retell-ai", tier: 1 },
  { name: "Julius AI", platform: "ashby", token: "julius", tier: 1 },
  { name: "OpenAI", platform: "ashby", token: "openai", tier: 1 },
  { name: "Scale AI", platform: "greenhouse", token: "scaleai", tier: 1 },
  { name: "Airwallex", platform: "ashby", token: "airwallex", tier: 1 },
  { name: "Brex", platform: "greenhouse", token: "brex", tier: 1 },
  { name: "ElevenLabs", platform: "ashby", token: "elevenlabs", tier: 1 },
  { name: "Fivetran", platform: "greenhouse", token: "fivetran", tier: 1 },
  { name: "AlphaSense", platform: "greenhouse", token: "alphasense", tier: 1 },
  { name: "Sierra", platform: "ashby", token: "sierra", tier: 1 },
  { name: "Harvey", platform: "ashby", token: "harvey", tier: 1 },
  { name: "ClickHouse", platform: "greenhouse", token: "clickhouse", tier: 1 },
  { name: "Grafana Labs", platform: "greenhouse", token: "grafanalabs", tier: 1 },
  { name: "Workato", platform: "greenhouse", token: "workato", tier: 1 },
  { name: "Netskope", platform: "greenhouse", token: "netskope", tier: 1 },
  { name: "Kong", platform: "ashby", token: "kong", tier: 1 },
];

// Tier 3: no usable JSON API, needs a rendered DOM. Kept OUT of REGISTRY so the
// hourly fetch sweep never sees platform:"browser" (it has no fetch adapter).
// token = parse shape (see browser.ts). google/apple/meta have real selectors;
// the rest ride the generic anchor fallback and are UNVERIFIED — a careers page
// that needs scrolling or login won't yield jobs, and that's an accepted ceiling.
// Google/Apple location filtering trusts the URL param: their cards carry no
// location text, so filter.ts sees a blank location (which it keeps as US).
export const TIER3: Company[] = [
  {
    name: "Google",
    platform: "browser",
    token: "google",
    tier: 3,
    url: "https://www.google.com/about/careers/applications/jobs/results/?q=software+engineer&location=United%20States&target_level=EARLY&target_level=MID",
    selector: 'a[aria-label^="Learn more about"]',
  },
  {
    name: "Apple",
    platform: "browser",
    token: "apple",
    tier: 3,
    url: "https://jobs.apple.com/en-us/search?sort=newest&location=united-states-USA",
    selector: 'a[href*="/en-us/details/"]',
  },
  {
    name: "Meta",
    platform: "browser",
    token: "meta",
    tier: 3,
    url: "https://www.metacareers.com/jobs?q=software%20engineer",
    selector: 'a[href*="/profile/job_details/"]',
  },
  // EA parses with the generic selector (verified, 11 kept). Keep it live.
  { name: "EA", platform: "browser", token: "generic", tier: 3, url: "https://jobs.ea.com/en_US/careers/SearchJobs/software%20engineer" },
  // Parked until each gets a real selector (W4). The generic fallback scrapes
  // nav/category anchors → 0 jobs while still burning browser-seconds. Microsoft
  // is browser-only (its eightfold endpoint 429s server-side, W2 note).
  // { name: "Microsoft", platform: "browser", token: "generic", tier: 3, url: "https://jobs.careers.microsoft.com/global/en/search?q=software%20engineer&lc=United%20States" },
  // { name: "Cisco", platform: "browser", token: "generic", tier: 3, url: "https://jobs.cisco.com/jobs/SearchJobs/software%20engineer" },
  // { name: "Intuit", platform: "browser", token: "generic", tier: 3, url: "https://jobs.intuit.com/search-jobs/software%20engineer" },
  // CoreWeave moved to REGISTRY tier-1 (it's on Greenhouse). No browser needed.
];

// Volume spammers to drop entirely (staffing firms, roles-farms). Lowercased match.
export const BLOCKED_COMPANIES: string[] = [];
