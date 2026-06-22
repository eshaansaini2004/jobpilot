# JobPilot — plan

New-grad job opening → tailored resume → autofilled application, from a phone.

Two pieces. A Cloudflare Worker that watches company job boards directly and
pushes to Discord. An iOS app that turns one job posting into a submitted
application.

**For a reviewer:** everything under "Verified" was measured in a session on
2026-08-10 with real network calls, not assumed. Everything under "Unverified"
is a genuine open risk. Please attack the tiering math, the Discord-vs-APNs
tradeoff, and the milestone ordering.

---

## Architecture

```
  Cloudflare Worker  (cron, hourly)
        │
        │  TIER 1  greenhouse · lever · ashby · workday
        │          smartrecruiters · workable            ~0.5s each, JSON
        │  TIER 2  amazon · eightfold (netflix)          one adapter each
        │  TIER 3  google · apple · meta · microsoft     browser render
        │          cisco · ea · intuit · coreweave       budget 10s each
        │
        ▼
   diff new job ids against KV       (ids, not timestamps)
        ▼
   filter: title keywords · US only · drop volume spammers
        ▼
   Discord bot      ──▶  card: company, title, location, [Apply] [Tailor this]
        │
        │  you tap "Tailor this"
        ▼
   deep link  jobpilot://job?url=…
        ▼
  ┌──────────────── iOS app ────────────────┐
  │  scrape JD      offscreen WKWebView     │
  │  tailor         Claude API              │
  │  render         pdfTeX WASM + your .tex │
  │  autofill       fill.js in WKWebView    │
  │  review         free-text answers sheet │
  │  submit         you tap it, never auto  │
  └─────────────────────────────────────────┘
```

## Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Watcher location | Cloudflare Worker, not on-device | `BGAppRefreshTask` is opportunistic and gives ~30s. Tier 3 alone needs ~28s for 4 companies |
| Notifications | Discord bot, HTTP-interactions endpoint on the Worker | Free. APNs needs the $99/yr Apple Developer Program. Buttons need a bot, not a plain webhook; a Worker is request-scoped so it serves interactions over HTTP, not a gateway connection. Costs one extra tap |
| Feed UI | Discord channels, not in-app | Deletes feed sync, notification code, and the feed screen from the app |
| Renderer | pdfTeX compiled to WASM | Keeps Eshaan's existing LaTeX template byte-identical. No CSS port |
| Diffing | set of job ids in KV | Workday returns `"Posted Today"`, and feeds backfill. Timestamps break |
| Free-text answers | LLM drafts into a review sheet | Never submit generated prose unread |
| Tailor timing | on tap | No API spend on jobs never opened |
| Submit | always a human tap | A bad auto-submit reaches a real recruiter under his name |
| Master resume | `master_resume.md` + `best_practices.md` + `template.tex` bundled as seed data | Already exist in `~/resume-tailor/`. No import UI |
| LLM provider | Bring-your-own via `{base_url, api_key, model}` | One OpenAI-shaped adapter covers OpenAI, DeepSeek, Groq, OpenRouter, Ollama, vLLM, LM Studio. Anthropic needs a second adapter |
| Structured output | Prompt for JSON, parse defensively, one repair retry | DeepSeek rejects `json_schema`; local models often support neither. Contract set at the weakest provider, native support is a per-adapter optimization |
| LLM call location | Worker, not app | With BYO-key the credential belongs to the user and may be any provider. App stores a Worker URL, never a key |

## Verified 2026-08-10

**Board APIs, live calls:**
```
greenhouse       boards-api.greenhouse.io/v1/boards/{token}/jobs        ✓
lever            api.lever.co/v0/postings/{token}?mode=json             ✓
ashby            api.ashbyhq.com/posting-api/job-board/{token}          ✓
workday          POST {t}.wdN.myworkdayjobs.com/wday/cxs/{t}/{site}/jobs ✓
smartrecruiters  api.smartrecruiters.com/v1/companies/{co}/postings     ✓
workable         apply.workable.com/api/v1/widget/accounts/{co}         ✓
amazon           amazon.jobs/en/search.json                             ✓
eightfold        explore.jobs.netflix.net/api/apply/v2/jobs             ✓
microsoft        apply.careers.microsoft.com/api/pcsx/search   TIER 3
google/apple/meta                                             TIER 3, DOM renders
```

Microsoft is on Eightfold, but the endpoint returned job JSON only when called
from inside a browser. A direct server-side request came back without a
`positions` key. **Classified Tier 3 on that evidence.** Possibly recoverable to
Tier 2 with the right Referer/Origin headers, but that is unproven and should
not be assumed in any budget math.

**Coverage:** 3,402 distinct companies in the Simplify feed. 74% sit on a
platform whose API is verified above. ~91% if iCIMS / Oracle / Rippling / JazzHR
also expose one (untested). ~9% genuinely need Tier 3.

**Company auto-detection:** slug = lowercased name works for 9 of 10 tested
(Ramp→ashby, Anthropic→greenhouse, Palantir→lever, …). Rippling failed.

**pdfTeX in WASM:** compiles Eshaan's real `.tex` in WebKit. 27s cold, **5.0s
warm, RSS flat at ~102MB across 3 consecutive compiles.** No leak.

**TeX footprint:** `pdflatex -recorder` on the real resume opens 62 files,
15.11MB. 8.22MB is the format (busytex ships its own) and 5.47MB is `pdftex.map`
(trims to 7 fonts). **1.41MB is what actually ships.**

**Autofill:** `DataTransfer` → `input.files` → `change` works in WebKit on live
Greenhouse, Ashby, and Lever forms. Field labels resolvable on 79/79 Lever,
46/47 Ashby, 18/22 Greenhouse inputs. Greenhouse uses ~18 custom comboboxes per
form; Lever and Ashby use almost none.

**Aggregator lag is real.** Affirm had a Software Engineer I live on Greenhouse
for 129 hours and absent from the Simplify feed, which listed Affirm as having
0 active roles. Scoutify independently claims a 2-7 day aggregator lag.

**Cloudflare free tier:** 100k req/day · KV 1GB, 1k writes/day · 5 cron
triggers · **10 min/day browser rendering**.

## Unverified — the reviewer should push here

- **Can the app drop background execution entirely?** The claim is yes: the
  Worker does all watching, Discord delivers the alert, and the app only ever
  runs because you tapped a deep link. If that holds, A4 ships with no
  `BackgroundTasks` import, no `BGAppRefreshTask` registration, and no
  background-mode entitlement at all.
  Reviewer: is there anything that forces background execution back in? The
  only candidate I see is pre-generating resumes before you open a job, which
  is explicitly out of scope. If this is wrong, the 30-second budget problem
  and all its complexity come back into the app.
- Greenhouse's ~18 custom comboboxes per form. The click-wait-click approach is
  designed but untested at that volume.
- Whether busytex will mount a custom trimmed `texmf` tree, or insists on its
  own bundled collection. If it insists, bundle size goes from ~1.4MB to ~50MB.
- iCIMS / Oracle / Rippling / JazzHR APIs. My test slugs 404'd; that proves
  nothing either way. Worth ~30 min to settle, moves coverage 74% → 91%.
- Deep linking from a Discord message into a custom URL scheme on iOS. Should
  work, not tested.

## Milestones

### Worker — no Xcode needed

**W0 — skeleton + tier 1 — DONE 2026-08-10**
- `wrangler` project, cron trigger, KV namespace  ✓ (`worker/`)
- Adapters: greenhouse, lever, ashby, workday  ✓ (workday probed vs Nvidia, 20 jobs)
- Company registry in `src/registry.ts`, one read + one write per cycle  ✓
- Diff by job id set (`company:id` keys)  ✓
- Verify: `node test/sweep.test.ts` → run 1: 2660 live / 2660 new, run 2: 0 new  ✓
- Open: workday capped at top-20, no pagination (ponytail note in adapter).
  Deploy still needs `wrangler login` + real KV id (your interactive step).

**W0.5 — deep-link spike — MOSTLY DONE 2026-08-10**
- OS-level routing PROVEN in simulator: LS resolves `jobpilot://` to the app
  ("Found application: com.eshaan.jobpilot to handle url scheme: jobpilot"),
  iOS shows the "Open in JobPilot?" prompt (screenshot). Parse of `?url=`
  verified separately (percent-encoded + missing-param cases).
- The prompt is one confirming tap, already in the cost model. `simctl` can't
  tap it, which is why headless openurl looked dead.
- STILL UNPROVEN (needs your physical phone, no Discord on the simulator):
  does Discord's in-app browser present that same prompt or swallow the tap?
  30-second test once the app is on the phone.
- Fallback still cheap insurance: Worker serves `https://<worker>/j/<id>` →
  302 → `jobpilot://`. Build W1's buttons to point at the https URL so the
  outcome of the Discord test can't block W1.

**W1 — notification + filtering — DONE 2026-08-10 (except live Discord send)**
- Discord bot posts one embed per job, two **Link-style** buttons ✓
  (`src/discord.ts`). `[Apply]` → job URL, `[Tailor this]` → `/tailor` redirect
  (Link buttons only accept http(s), so they can't point at `jobpilot://`
  directly — the Worker 302s). `/tailor` verified live: 302 → jobpilot://.
- Filter ✓ (`src/filter.ts`): software titles only, drop seniority/intern/
  non-software domains, US-only. 2660 live → 117 kept, 0 junk. 12 unit cases.
- Quiet hours ✓ (`src/quiet.ts`): collect 10pm–6am CST into `pending` KV key,
  drain on the next daytime cycle. Live-confirmed (ran at night → queued).
- Cold-start guard ✓: first run seeds KV silently, no backlog blast.
- Verify: `node test/{filter,discord}.test.ts` green; `wrangler dev` /run seeded
  2660 then queued (quiet), /tailor redirects.
- Live Discord POST ✓ verified 2026-08-11: deployed at
  `jobpilot.esshaan.workers.dev`, a test card landed in #jobpilot (200, sent 1).
  Bot token stored as a secret, channel id + WORKER_BASE bound. Cron live (0 * * * *).
  First real cron tick seeds silently; sends begin on the next tick with new jobs.

**W2 — tier 2 adapters — DONE + DEPLOYED 2026-08-11**
- amazon (`src/adapters/amazon.ts`) ✓ — US + software, top-100 recent.
- eightfold (`src/adapters/eightfold.ts`) ✓ — generic (host+domain per company),
  optional `query` to narrow a giant board. Netflix wired with query="new grad"
  (2 subrequests vs 49). Microsoft stays Tier 3.
- Filter hardened: numeric/roman/L-level seniority now dropped (was leaking
  "Software Engineer 5", "SDE II", "(L6)"). Tier-2 relevant 60 → 8, no junk.
- Free-tier subrequest guard: full sweep ~13 fetches, well under the 50 cap.
  NOTE: the "huge watchlist" will hit this ceiling (~45 companies/sweep max on
  free tier) — batch across crons or go Workers Paid when the real list lands.
- Netflix new-grad SWE role is seasonal (posts Sep/Oct, id 790313102199 not live
  in Aug); the query keeps watching for it cheaply.
- Deployed, KV re-seeded silently (0 burst), live /run → 0 sent. Tests: sweep,
  filter, discord, tier2 all green.

**W3 — tier 3 rendering — CODE DONE 2026-08-11 (on-CF measurement pending owner)**
- Gate #1 RESOLVED: Browser Rendering IS on the free Workers plan (10 min/day =
  600s, 3 concurrent browsers, 60s/session default). Plan assumption holds.
- Driver-agnostic extraction (`src/browser.ts`, `scrapeTier3(page, company)`) —
  no puppeteer import, so local Playwright drives the same code the worker runs
  under `@cloudflare/puppeteer`. Launch + round-robin cursor in `src/tier3.ts`.
- Selectors verified live, render times measured local (Mac, headless Chromium):
  Google `a[aria-label^="Learn more about"]` ~0.65s · Apple `a[href*="/en-us/details/"]`
  (dedup) ~1.1s · Meta `a[href*="/profile/job_details/"]` ~1.7s. All well under 10s.
- Google/Apple carry NO location text in cards → trust the US URL param, filter
  keeps blank as US. Meta ships worldwide → location from card line, filter drops
  Tel Aviv/Singapore (verified: 10 scraped, 2 foreign, 0 leaked past filter).
- Microsoft/Cisco/EA/Intuit/CoreWeave: generic-fallback registry entries, UNPROVEN.
- Separate cron `30 */2 * * *`, skipped in quiet hours (reuses quiet.ts) so it only
  runs 6am-10pm. Separate KV keys (seen_ids_tier3, tier3_seeded, tier3_cursor) — no
  collision with the hourly cycle. Per-company cold-start guard (round-robin surfaces
  new companies mid-rotation; a single first-run flag would blast them).
- Budget asserted in test: PER_SWEEP=3 × 10s × 8 sweeps/day = 240s < 600s cap.
  Per-company timeouts (10s goto + 6s selector) cap one company at 16s, so a
  3-company session is 48s worst case — under the 60s browser-session reap.
- STILL OWNER'S STEP (needs deploy, which I did NOT do): `npm i`, add the `[browser]`
  binding on deploy, and measure real browser-seconds/day over 48h to confirm < 600s.
- **Budget 10s per company, not 7.** 7s was one measurement of one site
  (Google). Apple and Meta are unmeasured and could be slower. Free tier is
  600s/day total. [measured: all 3 under 2s local; CF adds network/cold-start,
  10s budget kept as the safe ceiling.]

```
tier-3 companies   sweep cost   sweeps/day @600s   interval in a 16h window
        5             50s            12                  every ~1.3h
       10            100s             6                  every ~2.7h
       15            150s             4                  every  4h
       20            200s             3                  every ~5.3h
```

- **Sweeps run only 6am–10pm.** Running around the clock at a 4h interval is 6
  sweeps = 840s = 14 min and blows the budget. The window is load-bearing, not
  a preference. Tier 1 and 2 keep running overnight; they are effectively free
  and half the volume posts from Asian business hours.
- Tier 1 hourly, tier 3 on the rotation above
- Per-company DOM selector with a generic fallback
- Verify: measure real browser-seconds/day over 48h, assert under 600. Measure
  actual per-company render time for Apple and Meta and revise the table before
  committing to a company count.

**W4 — `/watch` endpoint**
- POST company name → guess slug against greenhouse/lever/ashby → fall back to
  feed lookup → fall back to pasted URL → else tier 3
- Returns a preview (platform, job count, 3 sample titles) before saving
- Also exposed as a Discord slash command
- Verify: 10 companies added by name only

### iOS app — needs Xcode (installed, 26.6, active)

**A0 — TeX bundle**
- `trimtex.sh`: recorder run → copy the 59 shippable files → trim `pdftex.map`
- Verify: compile against the trimmed tree, byte-compare PDF to baseline
- Exit: bundle ≤ 2MB excluding whatever busytex requires

**A1 — fill engine** *(started: `fill.js` written, untested)*
- Coverage harness in Playwright/WebKit against live forms
- **Collect unclassified textareas as `questions[]`** rather than dropping them.
  This is the handoff into A5's review sheet and the main differentiator
- Per-ATS overrides for whichever platforms the watchlist actually uses
- Exit: ≥80% of mechanical fields, free-text surfaced, zero submits

**A2 — LaTeX engine**
- `latex.html` hosting busytex, `texmf` mounted from app bundle
- `LatexEngine.swift`: offscreen WKWebView, `.tex` in → PDF `Data` out
- Fresh module per compile (~1s, removes all leak risk)
- Exit: PDF in under 10s cold, under 6s warm, on device

**W5 — provider adapters** · Worker, no Xcode

Lives in the Worker, not the app: the key belongs to the user and may be any
provider, so the app stores a Worker URL instead of a credential.

```
POST /tailor  { jd, master_resume, best_practices, template }
              → { bullets, projects, skills_line, answers[] }
```

- `openai.ts` — one adapter, `{base_url, api_key, model}`. Covers OpenAI,
  DeepSeek, Groq, OpenRouter, Ollama, vLLM, LM Studio. All verified live except
  the local ones
- `anthropic.ts` — separate: different auth header, `system` is top-level
- **Structured output at the weakest level.** Prompt for JSON, parse
  defensively, one repair retry on failure. DeepSeek rejects `json_schema` and
  most self-hosted models support neither. Native support is an optimization
  each adapter may declare, never a requirement
- Verify: identical prompt through OpenAI, DeepSeek, and Anthropic; all three
  produce parseable output and a compilable `.tex`
- Exit: `PROVIDERS.md` documenting the three config shapes

**A3 — tailor pipeline**
- Port `~/.claude/commands/tailor.md` rules into the prompt. It is the spec:
  bolding rules, exactly-2-line skills bullet, full-page fill, no orphan words,
  ATS constraints, no em dashes, no invented metrics
- Prompt lives in the Worker (W5), so it's provider-agnostic. Rules that lean on
  one model's instruction-following need testing across adapters
- Drafter pass then reviewer pass (borrowed from MadsLorentzen/ai-job-search).
  Doubles cost — make it a config flag, not a hardcoded second call
- Verify: 3 real JDs → compiles clean → JD keywords present in
  `PDFDocument.string` of the output

**A4 — app shell** *(skeleton started 2026-08-10: `ios/`, xcodegen project,
deep-link handler + minimal detail view build and route in the simulator)*
- SwiftData models, seed copy on first launch  — not started
- Deep link handler for `jobpilot://job?url=…`  ✓ routing + parse proven
- One job detail screen. No feed, no watchlist UI, no background refresh
  — placeholder view exists, real detail screen pending
- Exit: Discord tap opens the app on the right job

**A5 — apply flow**
- `JDScraper.swift`: offscreen WKWebView, per-ATS selector, generic fallback.
  Workday gives the whole JD via `[data-automation-id="jobPostingDescription"]`
- `ApplyWebView.swift`: persistent `WKWebsiteDataStore` so logins survive
- Inject `fill.js` as `WKUserScript` at `.atDocumentEnd`, pass profile + PDF base64
- `ReviewSheet.swift`: free-text drafts, editable, then injected
- Exit: one real application filled end to end, submitted by hand

## Out of scope for v1

- APNs push. Discord until the $99 Apple Developer Program is worth it
- Workday per-company account creation. Manual once, then the session persists
- iCloud sync of anything
- In-app job feed or browsing. Discord does it
- Broad non-watchlist discovery. `jobwatch` already covers that on the Mac

## Cost

```
Cloudflare Workers + KV + cron          $0
Browser Rendering                       $0   limit 600s/day.
                                             10 tier-3 companies @10s = 100s
                                             per sweep, 6 sweeps in the
                                             6am-10pm window = 600s. At the
                                             ceiling. 20 companies means
                                             3 sweeps/day, every ~5.3h.
Discord                                 $0
LLM (bring your own key)                per ~30k in / 4k out resume:
                                          Opus 5      $0.25  ($0.16 cached)
                                          Sonnet 5    $0.10  (intro, thru 8/31)
                                          Haiku 4.5   $0.05
                                          DeepSeek / Groq   cheaper still
                                          Ollama / vLLM     $0, your hardware
                                        Caching matters: master resume,
                                        best practices and template are
                                        byte-identical every call
Apple Developer Program                 $99/yr, deferred
```

## Honest note on the premise

Measured today: across 36 top company boards (OpenAI, Anthropic, Stripe, Ramp,
Databricks, Figma, Notion, Docker, Twitch, …) there were **5 genuine US new-grad
software openings**. OpenAI had 731 roles and zero for new grads. Anthropic 392
and zero.

That cuts both ways. A watchlist of hot startups will be very quiet, so this
will not feel busy. But it is also the argument for building it: those openings
are rare and short-lived, and a 5-day aggregator lag is the difference between
applying early and applying behind 4,000 people.
