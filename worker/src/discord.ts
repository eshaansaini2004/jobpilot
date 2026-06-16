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

// Send one message per job, sequentially. Personal watch = a handful per hour.
// ponytail: sequential with a single 429 backoff. If volume ever spikes, batch/queue.
export async function postJobs(
  jobs: Job[],
  env: DiscordEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    console.log(`discord: no token/channel set, would have sent ${jobs.length}`);
    return 0;
  }
  let sent = 0;
  for (let i = 0; i < jobs.length; i++) {
    const res = await fetchImpl(`${API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMessage(jobs[i], env.WORKER_BASE)),
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, retry * 1000));
      i--; // retry the same job once the rate limit clears
      continue;
    }
    if (!res.ok) {
      console.error(`discord ${res.status} for ${jobs[i].company} — ${jobs[i].title}`);
      continue;
    }
    sent++;
  }
  return sent;
}
