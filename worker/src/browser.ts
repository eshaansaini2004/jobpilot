import type { Company, Job } from "./types.ts";

// Tier-3 DOM extraction. Driver-agnostic on purpose: takes a `page` that is
// either a Playwright page (tests) or a @cloudflare/puppeteer page (worker).
// No puppeteer import here, so test/tier3.test.ts can drive it with Playwright.
// The puppeteer launch lives in tier3.ts.

// Companies rendered per sweep. The timeouts below cap one company at 16s worst
// case (10s goto + 6s selector), so 3/sweep = 48s worst case — under the 60s
// browser-session reap. Typical render is <3s (measured), so a real sweep is a
// few seconds. Budget: 3 * 10s * 8 sweeps/day = 240s/day (under the 600s cap).
// Ceilings asserted in test/tier3.test.ts. Lives here (not tier3.ts) so the test
// imports it without pulling in the puppeteer dep.
export const PER_SWEEP = 3;
const GOTO_MS = 10000;
const SELECTOR_MS = 6000;

// Minimal page surface both drivers implement. Keeps the import-free boundary honest.
export interface Page {
  goto(url: string, opts?: any): Promise<any>;
  waitForSelector(sel: string, opts?: any): Promise<any>;
  $$eval(sel: string, fn: (els: any[]) => any): Promise<any>;
  url(): string;
}

// Generic fallback: anchors that look like job links. Hit-or-miss by design.
const GENERIC_SEL = 'a[href*="job"], a[href*="career"], a[aria-label^="Learn more"]';

interface Raw {
  aria: string;
  lines: string[];
  href: string;
}

export async function scrapeTier3(page: Page, c: Company): Promise<Job[]> {
  if (!c.url) throw new Error(`browser ${c.name}: url required`);
  const sel = c.selector || GENERIC_SEL;
  await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: GOTO_MS });
  await page.waitForSelector(sel, { timeout: SELECTOR_MS });
  // Self-contained callback (no closures — neither driver serializes them).
  const raw: Raw[] = await page.$$eval(sel, (els: any[]) =>
    els.map((a) => ({
      aria: a.getAttribute("aria-label") || "",
      lines: (a.innerText || "").split("\n").map((s: string) => s.trim()).filter(Boolean),
      href: a.getAttribute("href") || "",
    })),
  );
  return parse(c, raw, page.url());
}

// Per-company parse. Selectors + shapes verified live 2026-08-11 for google/apple/meta.
function parse(c: Company, raw: Raw[], pageUrl: string): Job[] {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r.href) continue;
    let title = "";
    let location = "";
    let idHint = "";

    switch (c.token) {
      case "google":
        // aria-label is "Learn more about <title>"; card has no location text,
        // so we trust location=United States in the query (blank → filter keeps).
        title = r.aria.replace(/^Learn more about\s*/i, "");
        idHint = r.href.match(/results\/(\d+)/)?.[1] ?? r.href;
        break;
      case "apple":
        // Each card emits extra anchors ("See full role description", locationPicker).
        // Drop them; the real title anchor is the one whose text is the job title.
        title = r.lines[0] ?? "";
        if (/^see full role|^where we're hiring/i.test(title)) continue;
        idHint = r.href.match(/details\/([\w-]+)/)?.[1] ?? r.href;
        break;
      case "meta":
        title = r.lines[0] ?? "";
        location = r.lines[1] ?? ""; // load-bearing: board returns worldwide, filter drops non-US
        idHint = r.href.match(/(\d{6,})/)?.[1] ?? r.href;
        break;
      default: // generic fallback for the unverified tier-3 entries
        title = (r.aria || r.lines[0] || "").replace(/^Learn more about\s*/i, "");
        location = r.lines[1] ?? "";
        idHint = r.href.match(/(\d{5,})/)?.[1] ?? r.href;
    }

    title = title.trim();
    if (!title) continue;
    if (seen.has(idHint)) continue;
    seen.add(idHint);

    let url = r.href;
    try {
      url = new URL(r.href, pageUrl).href;
    } catch {}
    jobs.push({ id: idHint, title, location, url, company: c.name });
  }
  return jobs;
}
