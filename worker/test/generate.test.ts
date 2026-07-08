// A3 endpoint tests, no network. Asserts:
//   - the drafter prompt is well-formed (rules + master + preamble + JD present)
//   - extractTex survives junk: markdown fences, leading chatter, truncation, garbage
//   - the drafter/reviewer pipeline runs against a mock LLM and validates output
import { draftPrompt, reviewPrompt, clampJd, MAX_JD_CHARS } from "../src/prompt.ts";
import { extractTex, type LlmEnv } from "../src/llm.ts";
import { generateTex } from "../src/generate.ts";
import type { Turn } from "../src/prompt.ts";

let ok = true;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) ok = false;
};

const JD = "Backend Engineer. Stack: Go, PostgreSQL, distributed systems, Docker on AWS.";

// --- prompt shape ---
const d = draftPrompt(JD);
assert(d.system.includes("NO em dashes"), "draft system carries the no-em-dash rule");
assert(d.system.includes("EXACTLY 2 bullets"), "draft system carries the Peer Teacher rule");
assert(d.system.includes("HARD CAP 4"), "draft system carries the 4-project cap");
assert(d.user.includes("Eshaan Saini"), "draft user embeds the master resume");
assert(d.user.includes("\\documentclass"), "draft user embeds the gold preamble");
assert(d.user.includes(JD), "draft user embeds the JD");

const r = reviewPrompt(JD, "\\documentclass ... \\end{document}");
assert(r.system.includes("REVIEWING"), "review system frames a review pass");
assert(r.user.includes("DRAFT TO REVIEW"), "review user includes the draft");

// JD clamp (trust-boundary input guard)
assert(clampJd("x".repeat(MAX_JD_CHARS + 5000)).length === MAX_JD_CHARS, "long JD is clamped");

// --- extractTex on junk ---
const good = "\\documentclass{article}\\begin{document}hi\\end{document}";
assert(extractTex(good) === good, "clean tex passes through");
assert(
  extractTex("Here you go!\n```latex\n" + good + "\n```\nHope that helps.") === good,
  "markdown fences + chatter stripped",
);
assert(extractTex("Sure, here it is:\n" + good) === good, "leading prose stripped");
assert(extractTex("\\documentclass{article}\\begin{document}oops truncated") === null, "truncated (no \\end) -> null");
assert(extractTex("total garbage, no latex here") === null, "garbage -> null");
assert(extractTex("") === null, "empty -> null");
assert(extractTex(undefined as any) === null, "undefined -> null");

// --- full pipeline against a mock LLM ---
// Mock returns a real approved resume wrapped in fences (drafter) and a clean
// version (reviewer), so extract + validate exercise the whole path offline.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const approved = readFileSync(
  join(homedir(), "resume-tailor", "tex", "resume_Salesforce_SoftwareEngineeringAMTS.tex"),
  "utf8",
);

function mockFetch(body: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: body } }] }), {
      headers: { "content-type": "application/json" },
    })) as any;
}
const env: LlmEnv = { LLM_API_KEY: "test", LLM_MODEL: "mock" };

const res1 = await generateTex(JD, env, mockFetch("```latex\n" + approved + "\n```"));
assert(res1.tex.startsWith("\\documentclass"), "pipeline extracts tex from fenced drafter output");
assert(res1.tex.endsWith("\\end{document}"), "pipeline output ends at \\end{document}");
assert(res1.invented.length === 0, "approved resume validates clean through the pipeline");
assert(res1.reviewed === false, "no reviewer pass when LLM_REVIEW unset");

// reviewer pass on
const res2 = await generateTex(JD, { ...env, LLM_REVIEW: "1" }, mockFetch(approved));
assert(res2.reviewed === true, "reviewer pass runs when LLM_REVIEW=1");

// drafter emits junk -> loud failure, not a silent empty resume
let threw = false;
try {
  await generateTex(JD, env, mockFetch("no latex at all"));
} catch {
  threw = true;
}
assert(threw, "unparseable drafter output throws");

if (!ok) {
  console.error("\nFAIL: generate tests");
  process.exit(1);
}
console.log("\nPASS: generate tests");
