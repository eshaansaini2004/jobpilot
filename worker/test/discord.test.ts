import { buildMessage, postJobs } from "../src/discord.ts";
import { isQuietHours, hourIn } from "../src/quiet.ts";
import type { Job } from "../src/types.ts";

let ok = true;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) ok = false;
};

const job: Job = {
  id: "123",
  title: "Software Engineer, New Grad",
  location: "Austin, TX",
  url: "https://boards.greenhouse.io/anthropic/jobs/123",
  company: "Anthropic",
};

// --- payload shape ---
const msg = buildMessage(job, "https://jp.workers.dev");
check(msg.embeds[0].title === job.title, "embed title = job title");
check(msg.embeds[0].url === job.url, "embed url = job url");
check(msg.embeds[0].description.includes("Anthropic"), "embed shows company");
const row = msg.components[0];
check(row.type === 1, "action row type 1");
check(row.components.length === 2, "two buttons");
check(
  row.components.every((b: any) => b.type === 2 && b.style === 5 && typeof b.url === "string"),
  "both buttons are Link-style (type 2, style 5) with a url",
);
check(row.components[0].url === job.url, "Apply button -> job url");
check(
  row.components[1].url === "https://jp.workers.dev/tailor?url=" + encodeURIComponent(job.url),
  "Tailor button -> worker redirect with encoded url",
);

// --- send request shape, using a fake fetch (no real Discord call) ---
let captured: { url: string; init: any } | null = null;
const fakeFetch = (async (url: any, init: any) => {
  captured = { url: String(url), init };
  return { ok: true, status: 200, headers: new Map() } as any;
}) as unknown as typeof fetch;

const sent = await postJobs([job], {
  DISCORD_BOT_TOKEN: "test-token",
  DISCORD_CHANNEL_ID: "999",
  WORKER_BASE: "https://jp.workers.dev",
}, fakeFetch);

check(sent === 1, "postJobs reports 1 sent");
check(captured!.url === "https://discord.com/api/v10/channels/999/messages", "hits channel messages endpoint");
check(captured!.init.headers.Authorization === "Bot test-token", "Bot auth header");
check(JSON.parse(captured!.init.body).components[0].components.length === 2, "body carries 2 buttons");

// no token -> no send, no throw
const sent0 = await postJobs([job], { WORKER_BASE: "https://jp.workers.dev" }, fakeFetch);
check(sent0 === 0, "no token -> 0 sent, no crash");

// --- quiet hours ---
const at = (h: number) => new Date(Date.UTC(2026, 0, 15, (h + 6) % 24, 0, 0)); // rough CST = UTC-6
check(hourIn("America/Chicago", at(23)) === 23, "hourIn respects tz");
check(isQuietHours(at(23)) === true, "11pm CST is quiet");
check(isQuietHours(at(3)) === true, "3am CST is quiet");
check(isQuietHours(at(10)) === false, "10am CST is not quiet");
check(isQuietHours(at(21)) === false, "9pm CST is not quiet");

if (!ok) {
  console.error("\nFAIL: discord/quiet tests");
  process.exit(1);
}
console.log("\nPASS: payload, send shape, quiet hours");
