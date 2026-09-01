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

const bot = {
  DISCORD_BOT_TOKEN: "test-token",
  DISCORD_CHANNEL_ID: "999",
  WORKER_BASE: "https://jp.workers.dev",
};
const { sent, failed } = await postJobs([job], bot, fakeFetch);

check(sent === 1, "postJobs reports 1 sent");
check(failed.length === 0, "nothing requeued on success");
check(captured!.url === "https://discord.com/api/v10/channels/999/messages", "hits channel messages endpoint");
check(captured!.init.headers.Authorization === "Bot test-token", "Bot auth header");
check(JSON.parse(captured!.init.body).components[0].components.length === 2, "body carries 2 buttons");

// no token -> no send, no throw, and NOT requeued (an unconfigured worker would
// otherwise grow the pending queue forever)
const r0 = await postJobs([job], { WORKER_BASE: "https://jp.workers.dev" }, fakeFetch);
check(r0.sent === 0 && r0.failed.length === 0, "no token -> 0 sent, nothing requeued, no crash");

// --- delivery failures must come back for requeue, not vanish ---
// The caller marks ids seen before posting, so a dropped job is never retried.
const stub = (r: any) => (async () => r) as unknown as typeof fetch;

const r5 = await postJobs([job], bot, stub({ ok: false, status: 500, headers: new Map() }));
check(r5.sent === 0 && r5.failed.length === 1, "5xx -> requeued");

const r4 = await postJobs([job], bot, stub({ ok: false, status: 400, headers: new Map() }));
check(r4.sent === 0 && r4.failed.length === 0, "4xx is a bad payload -> dropped, not queued forever");

const rNet = await postJobs([job, job], bot, (async () => {
  throw new Error("connect ECONNREFUSED");
}) as unknown as typeof fetch);
check(rNet.sent === 0 && rNet.failed.length === 2, "network error -> whole remaining batch requeued");

// Unbounded 429s used to spin forever (i-- with no cap) against the 5min CPU limit.
let calls = 0;
const r429 = await postJobs([job], bot, (async () => {
  calls++;
  return { ok: false, status: 429, headers: new Map([["retry-after", "0"]]) } as any;
}) as unknown as typeof fetch);
check(calls <= 5, `429 retries are bounded (took ${calls} calls)`);
check(r429.sent === 0 && r429.failed.length === 1, "exhausted 429 -> requeued");

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
