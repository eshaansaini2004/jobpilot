import { sweep } from "./sweep.ts";
import { tier3Sweep } from "./tier3.ts";
import { filterJobs } from "./filter.ts";
import { isQuietHours } from "./quiet.ts";
import { postJobs, type DiscordEnv } from "./discord.ts";
import { BLOCKED_COMPANIES, REGISTRY } from "./registry.ts";
import { generateTex, trimTex } from "./generate.ts";
import type { LlmEnv } from "./llm.ts";
import type { Job } from "./types.ts";

// Minimal KV surface so W0/W1 need no @cloudflare/workers-types dep.
interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
interface Env extends DiscordEnv, LlmEnv {
  JOBS_KV: KV;
  BROWSER?: any; // Browser Rendering binding (tier 3)
}

const SEEN_KEY = "seen_ids";
const PENDING_KEY = "pending_jobs";
// Company names whose backlog was already absorbed. A company added to REGISTRY
// mid-life would otherwise dump its entire existing board to Discord on the next
// run (every id is "new" vs seen). Same per-company cold-start as tier 3.
const SEEDED_T1_KEY = "seeded_companies_t1";

// Tier 3 keeps its own state. Separate seen key so the hourly and tier-3 cycles
// never write the same KV value in the same minute (last-writer-wins would
// resurrect ids as "fresh"). No pending: tier 3 only runs outside quiet hours.
const SEEN_TIER3_KEY = "seen_ids_tier3";
const SEEDED_KEY = "tier3_seeded"; // company names whose first batch was already absorbed
const CURSOR_KEY = "tier3_cursor";
const TIER3_CRON = "30 */2 * * *";

async function runCycle(env: Env): Promise<number> {
  const rawSeen = await env.JOBS_KV.get(SEEN_KEY);
  const firstRun = rawSeen === null;
  const seen = new Set<string>(rawSeen ? JSON.parse(rawSeen) : []);

  // Workers Paid: 10k subrequests + 5min CPU per run, so sweep every company every
  // hour (no round-robin). Memory stays flat because sweep() retains only unseen jobs.
  const { fresh, total, errors, swept } = await sweep(seen, REGISTRY);
  await env.JOBS_KV.put(SEEN_KEY, JSON.stringify([...seen]));
  if (errors.length) console.error("adapter errors:", errors.join("; "));

  // Cold start: mark everything seen but don't blast the whole backlog to Discord.
  if (firstRun) {
    console.log(`seeded ${total} jobs on first run, no notifications sent`);
    return 0;
  }

  // Per-company cold start: any company not yet in the seeded set gets its whole
  // current board absorbed silently (its ids are already in `seen` above). Only
  // established companies post. Kills the burst when a new company is added.
  // Only companies that actually fetched this run — a failed fetch must NOT be
  // marked seeded (its ids never entered `seen`, so it'd blast its whole board next run).
  const seeded = new Set<string>(JSON.parse((await env.JOBS_KV.get(SEEDED_T1_KEY)) ?? "[]"));
  const firstSight = swept.filter((n) => !seeded.has(n));
  if (firstSight.length) {
    for (const n of firstSight) seeded.add(n);
    await env.JOBS_KV.put(SEEDED_T1_KEY, JSON.stringify([...seeded]));
  }
  const firstSet = new Set(firstSight);
  const established = fresh.filter((j) => !firstSet.has(j.company));

  const blocked = new Set(BLOCKED_COMPANIES.map((c) => c.toLowerCase()));
  const relevant = filterJobs(established, { blockedCompanies: blocked });

  const pending: Job[] = JSON.parse((await env.JOBS_KV.get(PENDING_KEY)) ?? "[]");

  if (isQuietHours()) {
    if (relevant.length) {
      await env.JOBS_KV.put(PENDING_KEY, JSON.stringify([...pending, ...relevant]));
    }
    console.log(`quiet hours: queued ${relevant.length}, ${pending.length + relevant.length} pending`);
    return 0;
  }

  const toSend = [...pending, ...relevant];
  const sent = await postJobs(toSend, env);
  if (pending.length) await env.JOBS_KV.put(PENDING_KEY, "[]");
  console.log(`cycle: ${total} live, ${fresh.length} new, ${relevant.length} relevant, ${sent} sent`);
  return sent;
}

// Tier-3 cycle: render a round-robin slice, diff by id, post through the same
// filter + Discord path as tier 1/2. Per-company cold start (not a single first-
// run flag) because round-robin surfaces new companies mid-rotation — without
// this, sweep 2 would blast every job from the companies it renders first.
async function runTier3Cycle(env: Env): Promise<number> {
  if (!env.BROWSER) {
    console.log("tier3: no BROWSER binding, skipping");
    return 0;
  }
  const seen = new Set<string>(JSON.parse((await env.JOBS_KV.get(SEEN_TIER3_KEY)) ?? "[]"));
  const seeded = new Set<string>(JSON.parse((await env.JOBS_KV.get(SEEDED_KEY)) ?? "[]"));

  const { fresh, rendered, errors } = await tier3Sweep(seen, {
    browser: env.BROWSER,
    getCursor: async () => Number((await env.JOBS_KV.get(CURSOR_KEY)) ?? "0"),
    setCursor: (n) => env.JOBS_KV.put(CURSOR_KEY, String(n)),
  });
  await env.JOBS_KV.put(SEEN_TIER3_KEY, JSON.stringify([...seen]));
  if (errors.length) console.error("tier3 errors:", errors.join("; "));

  // Any company rendered for the first time gets its whole batch absorbed silently.
  const firstSight = rendered.filter((name) => !seeded.has(name));
  if (firstSight.length) {
    for (const name of firstSight) seeded.add(name);
    await env.JOBS_KV.put(SEEDED_KEY, JSON.stringify([...seeded]));
  }
  const firstSet = new Set(firstSight);
  const established = fresh.filter((j) => !firstSet.has(j.company));

  const blocked = new Set(BLOCKED_COMPANIES.map((c) => c.toLowerCase()));
  const relevant = filterJobs(established, { blockedCompanies: blocked });
  const sent = await postJobs(relevant, env);
  console.log(
    `tier3: rendered [${rendered.join(",")}], ${fresh.length} new, seeded [${firstSight.join(",") || "none"}], ${relevant.length} relevant, ${sent} sent`,
  );
  return sent;
}

export default {
  async scheduled(event: any, env: Env, _ctx: any) {
    console.log(`scheduled: cron="${event?.cron}"`);
    if (event?.cron === TIER3_CRON) {
      if (isQuietHours()) {
        console.log("tier3: quiet hours (10pm-6am CST), skipping");
        return;
      }
      await runTier3Cycle(env);
      return;
    }
    await runCycle(env);
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);

    // Button target: https link Discord accepts, 302s into the app's custom scheme.
    if (url.pathname === "/tailor") {
      const target = url.searchParams.get("url");
      if (!target) return new Response("missing url", { status: 400 });
      return new Response(null, {
        status: 302,
        headers: { Location: `jobpilot://job?url=${encodeURIComponent(target)}` },
      });
    }

    // A3: JD -> tailored .tex. The app POSTs { jd }; the LLM key lives here as a
    // Worker secret (BYO-key), never in the app. Owner-gated: returns 501 until
    // LLM_API_KEY is set, same pattern as the Discord send.
    if (url.pathname === "/generate" && req.method === "POST") {
      if (!env.LLM_API_KEY) {
        return Response.json({ error: "LLM_API_KEY not set (owner-gated)" }, { status: 501 });
      }
      let jd: string;
      try {
        jd = (await req.json<{ jd?: string }>())?.jd ?? "";
      } catch {
        return Response.json({ error: "invalid json body" }, { status: 400 });
      }
      if (!jd.trim()) return Response.json({ error: "missing jd" }, { status: 400 });
      try {
        const { tex, invented, reviewed } = await generateTex(jd, env);
        return Response.json({ tex, invented, reviewed });
      } catch (e: any) {
        return Response.json({ error: String(e?.message ?? e) }, { status: 502 });
      }
    }

    // A3: trim an over-length resume to one page. The app compiles on-device,
    // counts pages, and calls this with the .tex when it runs long.
    if (url.pathname === "/trim" && req.method === "POST") {
      if (!env.LLM_API_KEY) {
        return Response.json({ error: "LLM_API_KEY not set (owner-gated)" }, { status: 501 });
      }
      let body: { tex?: string; pages?: number };
      try {
        body = await req.json<{ tex?: string; pages?: number }>();
      } catch {
        return Response.json({ error: "invalid json body" }, { status: 400 });
      }
      if (!body.tex?.trim()) return Response.json({ error: "missing tex" }, { status: 400 });
      try {
        const { tex, invented } = await trimTex(body.tex, body.pages ?? 2, env);
        return Response.json({ tex, invented });
      } catch (e: any) {
        return Response.json({ error: String(e?.message ?? e) }, { status: 502 });
      }
    }

    // Manual cycle trigger for `wrangler dev`.
    if (url.pathname === "/run") {
      const n = await runCycle(env);
      return new Response(`${n} sent\n`);
    }

    // Manual tier-3 trigger (needs the BROWSER binding; wrangler dev --remote).
    if (url.pathname === "/run-tier3") {
      const n = await runTier3Cycle(env);
      return new Response(`${n} sent\n`);
    }

    return new Response("jobpilot worker\n");
  },
};
