import puppeteer from "@cloudflare/puppeteer";
import { TIER3 } from "./registry.ts";
import { scrapeTier3, PER_SWEEP } from "./browser.ts";
import { jobKey, type Company, type Job } from "./types.ts";

export interface Tier3Deps {
  browser: any; // env.BROWSER binding
  getCursor(): Promise<number>;
  setCursor(n: number): Promise<void>;
}

export interface Tier3Result {
  fresh: Job[];
  rendered: string[]; // company names actually rendered this sweep
  errors: string[];
}

// Launch ONE browser, render a round-robin PER_SWEEP slice of TIER3, diff by id.
// Budget math lives on PER_SWEEP in browser.ts. Mirrors sweep()'s per-source
// try/catch so one hung page doesn't kill the rest of the slice.
export async function tier3Sweep(seen: Set<string>, deps: Tier3Deps): Promise<Tier3Result> {
  const cursor = await deps.getCursor();
  const slice = pick(TIER3, cursor, PER_SWEEP);
  const found: Job[] = [];
  const rendered: string[] = [];
  const errors: string[] = [];

  const browser = await puppeteer.launch(deps.browser);
  try {
    for (const c of slice) {
      let page;
      try {
        page = await browser.newPage();
        found.push(...(await scrapeTier3(page, c)));
        rendered.push(c.name);
      } catch (err) {
        errors.push(`${c.name}: ${(err as Error).message}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  await deps.setCursor((cursor + PER_SWEEP) % TIER3.length);

  const fresh = found.filter((j) => !seen.has(jobKey(j)));
  for (const j of found) seen.add(jobKey(j));
  return { fresh, rendered, errors };
}

function pick(arr: Company[], start: number, n: number): Company[] {
  const out: Company[] = [];
  const len = arr.length;
  for (let i = 0; i < Math.min(n, len); i++) out.push(arr[(start + i) % len]);
  return out;
}
