import type { Job } from "./types.ts";

export interface DiscordEnv {
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
  WORKER_BASE: string; // e.g. https://jobpilot.<sub>.workers.dev
}

const API = "https://discord.com/api/v10";

// One embed per job, two Link-style buttons. Link buttons require http(s) urls,
// so "Tailor this" points at the Worker's /tailor redirect, not jobpilot:// directly.
export function buildMessage(job: Job, workerBase: string) {
  const tailorUrl = `${workerBase}/tailor?url=${encodeURIComponent(job.url)}`;
  return {
    embeds: [
      {
        title: job.title.slice(0, 256),
        url: job.url,
        description: `**${job.company}** · ${job.location || "location n/a"}`.slice(0, 4096),
        color: 0x5865f2,
      },
    ],
    components: [
      {
        type: 1, // action row
        components: [
          { type: 2, style: 5, label: "Apply", url: job.url },
          { type: 2, style: 5, label: "Tailor this", url: tailorUrl },
        ],
      },
    ],
  };
}

// A job's id is marked seen before it is posted, so anything that doesn't make it
// to Discord here is gone unless the caller requeues it. Hence `failed`: every job
// this returns unsent must be persisted by the caller, never dropped.
export interface PostResult {
  sent: number;
  failed: Job[];
}

// Send one message per job, sequentially. Personal watch = a handful per hour.
// ponytail: sequential with a bounded 429 backoff. If volume ever spikes, batch/queue.
const MAX_429_RETRIES = 3;

export async function postJobs(
  jobs: Job[],
  env: DiscordEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    console.log(`discord: no token/channel set, would have sent ${jobs.length}`);
    // Unconfigured is not a delivery failure — requeueing here would grow the
    // pending queue forever on a worker that simply has no Discord wired up.
    return { sent: 0, failed: [] };
  }
  let sent = 0;
  const failed: Job[] = [];
  let retries = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    let res: Response;
    try {
      res = await fetchImpl(`${API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildMessage(job, env.WORKER_BASE)),
      });
    } catch (err) {
      // Network-level failure. Discord is unreachable, so the rest of this batch
      // almost certainly fails too: requeue everything left and stop burning CPU.
      console.error(`discord unreachable at ${job.company} — ${(err as Error).message}`);
      failed.push(...jobs.slice(i));
      break;
    }
    if (res.status === 429) {
      if (++retries > MAX_429_RETRIES) {
        console.error(`discord: rate limited ${retries}x, requeueing ${jobs.length - i} job(s)`);
        failed.push(...jobs.slice(i));
        break;
      }
      const retry = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, retry * 1000));
      i--; // retry the same job once the rate limit clears
      continue;
    }
    retries = 0;
    if (!res.ok) {
      console.error(`discord ${res.status} for ${job.company} — ${job.title}`);
      // 4xx is a bad payload — retrying it forever would wedge the queue. Only
      // 5xx is worth another cycle.
      if (res.status >= 500) failed.push(job);
      continue;
    }
    sent++;
  }
  return { sent, failed };
}
