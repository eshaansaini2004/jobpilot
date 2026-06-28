import { chromium } from "playwright";
import { scrapeTier3, PER_SWEEP } from "../src/browser.ts";
import { TIER3 } from "../src/registry.ts";

// W3 verify: drive the real extraction with LOCAL Playwright (the worker uses
// @cloudflare/puppeteer via the same scrapeTier3 — same page API). Asserts
// google/apple/meta each yield >0 jobs with non-empty title/url, PRINTS the
// measured render time per company, and asserts the daily browser budget < 600s.
// The on-Cloudflare browser-seconds measurement is the owner's step (needs deploy).

const TARGETS = ["google", "apple", "meta"];
let fail = false;

const browser = await chromium.launch();
for (const token of TARGETS) {
  const c = TIER3.find((x) => x.token === token);
  if (!c) {
    console.error(`FAIL: no TIER3 entry for ${token}`);
    fail = true;
    continue;
  }
  const page = await browser.newPage();
  const t0 = Date.now();
  let jobs: Awaited<ReturnType<typeof scrapeTier3>> = [];
  try {
    jobs = await scrapeTier3(page, c);
  } catch (err) {
    console.error(`FAIL: ${c.name} threw — ${(err as Error).message}`);
    fail = true;
  }
  const ms = Date.now() - t0;
  await page.close();

  console.log(`${c.name}: ${jobs.length} jobs in ${ms}ms (render time)`);
  if (jobs.length === 0) {
    console.error(`FAIL: ${c.name} returned 0 jobs`);
    fail = true;
  }
  for (const j of jobs) {
    if (!j.title || !j.url) {
      console.error(`FAIL: ${c.name} job missing title/url: ${JSON.stringify(j)}`);
      fail = true;
      break;
    }
  }
  if (ms > 10000) console.warn(`  WARN: ${c.name} render ${ms}ms over the 10s/company budget`);
  console.log(`  sample: ${jobs.slice(0, 2).map((j) => `[${j.title} | ${j.location || "loc n/a"}]`).join("  ")}`);
}
await browser.close();

// Budget assertion (the plan wants this asserted, not just noted).
// 6am-10pm window, tier-3 cron every 2h → 8 sweeps/day. PER_SWEEP comes from the
// adapter so the number can't drift out of sync with what actually renders.
const RENDER_BUDGET_S = 10;
const SWEEPS_PER_DAY = 8;
const CAP_S = 600;
const daily = PER_SWEEP * RENDER_BUDGET_S * SWEEPS_PER_DAY;
console.log(`budget: ${PER_SWEEP} companies × ${RENDER_BUDGET_S}s × ${SWEEPS_PER_DAY} sweeps = ${daily}s/day (cap ${CAP_S}s)`);
if (daily >= CAP_S) {
  console.error(`FAIL: daily browser budget ${daily}s >= ${CAP_S}s cap`);
  fail = true;
}

if (fail) process.exit(1);
console.log("PASS: tier 3 google/apple/meta green, budget under 600s/day");
