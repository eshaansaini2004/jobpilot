# JobPilot — handoff brief for a reviewing agent

You are reviewing a plan, not code. Almost nothing is built yet. Your job is to
attack the assumptions before implementation starts.

**Read `tasks/todo.md` alongside this.** That file is the plan; this file is the
context you need to review it.

---

## What is being built

An iOS app plus a Cloudflare Worker that closes this loop:

```
company posts a job  →  Worker notices within the hour  →  Discord alert
                                                              │
                                                        you tap "Tailor"
                                                              ▼
                                              iOS app: scrape JD → LLM
                                              → LaTeX → PDF → autofill
                                              → review sheet → you submit
```

Built by a CS junior at Texas A&M for his own new-grad job search. He already
has a working desktop version of the tailoring half (`~/.claude/commands/tailor.md`
plus `~/resume-tailor/`) and a working Mac job watcher (`~/jobwatch/job_watch.py`,
102 lines, launchd hourly). The project is porting both to a phone and adding the
apply step neither has.

---

## Verified by measurement on 2026-08-10

Everything here came from a real network call or a real run, not from memory.
Treat it as evidence. Everything **not** in this section is an assumption.

**ATS board APIs — all public, no auth, live-tested**
```
greenhouse       boards-api.greenhouse.io/v1/boards/{token}/jobs         ✓
lever            api.lever.co/v0/postings/{token}?mode=json              ✓
ashby            api.ashbyhq.com/posting-api/job-board/{token}           ✓
workday          POST {t}.wdN.myworkdayjobs.com/wday/cxs/{t}/{site}/jobs ✓
smartrecruiters  api.smartrecruiters.com/v1/companies/{co}/postings      ✓
workable         apply.workable.com/api/v1/widget/accounts/{co}          ✓
amazon           amazon.jobs/en/search.json                              ✓
eightfold        explore.jobs.netflix.net/api/apply/v2/jobs              ✓
```
Untested (test slugs 404'd, proves nothing): iCIMS, Oracle, Rippling, JazzHR.
**Tier 3** (no usable API, needs browser rendering): google, apple, meta,
microsoft, cisco, ea, intuit, coreweave.

Microsoft deserves a note: it is on Eightfold at
`apply.careers.microsoft.com/api/pcsx/search`, which returned job JSON **inside a
browser** and failed from a plain server-side request. Classified Tier 3 on that
evidence.

**Coverage.** 3,402 distinct companies in the SimplifyJobs feed. 74% sit on a
platform whose API is verified above; ~91% if the four untested ones work; ~9%
genuinely need Tier 3.

**Company auto-detection.** Slug = lowercased company name resolves 9 of 10
tested (Ramp→ashby, Anthropic→greenhouse, Palantir→lever, Stripe, Figma, Notion,
Databricks, Vercel, Discord). Rippling failed.

**pdfTeX compiled to WASM**, run in WebKit (the WKWebView engine family) against
his real `resume_Amazon_SoftwareDevelopmentEngineer.tex`:
```
baseline RSS 109 MB
compile 1: OK  27.2s  RSS 102 MB     ← cold, includes TeX Live download
compile 2: OK   5.0s  RSS 102 MB
compile 3: OK   5.0s  RSS 101 MB
```
No leak across repeats. That was the risk that could have killed the approach.

**TeX footprint.** `pdflatex -recorder` on the real resume opens **62 files,
15.11 MB**. 8.22 MB is the format file (busytex ships its own) and 5.47 MB is
`pdftex.map` (trims to the 7 fonts actually used). **1.41 MB is what ships.**

**Autofill.** `DataTransfer` → `input.files` → dispatch `change` works in WebKit
on live Greenhouse, Ashby, and Lever forms — file attached, filename survived,
change event fired. Field labels resolvable on 79/79 Lever inputs, 46/47 Ashby,
18/22 Greenhouse. Greenhouse uses ~18 custom comboboxes per form; Lever and Ashby
use almost none.

**Workday DOM.** A live KLA posting exposed 42 `data-automation-id` hooks
including `jobPostingDescription` carrying the full 7,843-char JD in one selector.

**Aggregator lag is real.** Affirm had a Software Engineer I live on their
Greenhouse board for 129 hours while the Simplify feed listed Affirm as having
0 active roles. Scoutify independently markets a 2–7 day aggregator lag.

**Cloudflare free tier.** 100k req/day · KV 1 GB, 1k writes/day · 5 cron
triggers · 600s/day browser rendering.

**Market reality.** Across 36 top boards (OpenAI, Anthropic, Stripe, Ramp,
Databricks, Figma, Notion, Docker, Twitch…) there were **5 genuine US new-grad
software openings**. OpenAI had 731 roles and zero for new grads.

---

## Open questions — please attack these

1. **Can the iOS app drop background execution entirely?** The claim is yes: the
   Worker watches, Discord delivers, the app only runs on a deep-link tap. If
   that holds, no `BackgroundTasks` import, no entitlement. Is there anything
   that forces it back in? If so the 30-second budget problem returns.

2. **Will busytex mount a custom trimmed `texmf` tree**, or does it insist on its
   own bundled collection? This is the one unverified thing that changes a real
   number: bundle goes from ~1.4 MB to ~50 MB if it insists.

3. **Tier 3 arithmetic.** Budgeted at 10s per company (7s was one Google
   measurement; Apple and Meta are unmeasured). 600s/day free, sweeps only run
   6am–10pm — that window is load-bearing, not a preference. Check the table in
   `todo.md` W3.

4. **Deep link.** Does `jobpilot://` survive a tap inside Discord's iOS in-app
   browser? Gated as W0.5 with an https-redirect fallback, but unproven.

5. **Greenhouse's ~18 custom comboboxes per form.** Click → wait for listbox →
   click option is designed but untested at that volume.

6. **Provider abstraction (newest, least reviewed).** See below.

---

## The provider question

He wants this open-sourceable — other people bring their own key, not
necessarily Anthropic's. Verified today:

```
OpenAI       api.openai.com/v1              401 (endpoint live)
DeepSeek     api.deepseek.com               401 (endpoint live)
Groq         api.groq.com/openai/v1         401 (endpoint live)
OpenRouter   openrouter.ai/api/v1/models    200
Gemini       .../v1beta/openai/  ← this exact path 404s; the OpenAI-compat
                                    base is real but the path needs checking
```

OpenAI, DeepSeek, Groq, and OpenRouter all speak the OpenAI chat-completions
shape, so **one client covers four providers plus anything self-hosted (Ollama,
vLLM, LM Studio)**. Anthropic needs its own adapter — different auth header,
different message shape, `system` is top-level.

**The sharp edge:** structured output support is not uniform.
- OpenAI: `response_format: {type: "json_schema"}`, strict.
- DeepSeek: `{type: "json_object"}` only — **rejects `json_schema`**.
- Anthropic: `output_config.format`.
- Local models: often neither.

The plan's answer is to define the contract at the weakest level — prompt for
JSON, parse defensively, repair once on failure — and treat native structured
output as an optimization per adapter. **Please sanity-check that.** The
alternative (require `json_schema`) is cleaner but cuts DeepSeek and most
self-hosted setups, which is most of the point of doing this.

Also worth your scrutiny: the app previously planned to hold an Anthropic key in
Keychain. With BYO-key that's now a *user's* key of unknown provider. The plan
routes LLM calls through the user's own Worker instead, so the app stores a URL
rather than a credential. Is that the right call, or over-engineering for a
personal tool?

---

## Constraints that are not up for debate

- **Never auto-submit an application.** Fill, show a review screen, human taps
  submit. A bad auto-submit reaches a real recruiter under his real name.
- **Never fabricate resume content.** Numbers come from `master_resume.md` only.
  His own `tailor.md` and the reference repo both make this load-bearing.
- **The LaTeX template does not get rewritten.** He has nine tuned `.tex` files
  producing resumes he actually sends. A phone-rendered resume that looks
  different from the desktop one is a defect, not a porting inconvenience.

## Explicitly out of scope for v1

APNs push (Discord until the $99 Apple Developer fee is worth it) · Workday
per-company account creation (manual once, session persists) · iCloud sync ·
in-app job feed (Discord does it) · broad non-watchlist discovery (the Mac
watcher covers it).

---

## What would be most useful from you

Ranked findings, most severe first. For each: what breaks, under what
conditions, and what you'd change. Say plainly when something is unverifiable
from the plan alone rather than guessing.

Prior review passes caught a garbled requirement, a Microsoft tier
contradiction, an arithmetic inconsistency in the Tier 3 budget, and a
misunderstanding about Discord webhooks vs bot apps. All four were real. That
level of scrutiny is what's wanted.
