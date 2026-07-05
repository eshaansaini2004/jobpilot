import { draftPrompt, reviewPrompt, correctPrompt, trimPrompt } from "./prompt.ts";
import { callLlm, extractTex, reviewEnabled, type LlmEnv } from "./llm.ts";
import { findInventedNumbers } from "./validate.ts";
import { MASTER_RESUME } from "./assets.ts";

export interface GenerateResult {
  tex: string;
  invented: string[]; // number tokens not traceable to the master resume
  reviewed: boolean;
}

// JD -> tailored .tex. Drafter pass, then an optional reviewer pass (LLM_REVIEW).
// Validates the result against the master resume but does NOT hard-fail on a hit:
// a strict false positive shouldn't black-hole the whole feature with no output
// to inspect. The hard gate is test/no_invented_content.test.ts. We surface the
// tokens in `invented` and log loudly so nothing silently ships fabricated.
export async function generateTex(jd: string, env: LlmEnv, f: typeof fetch = fetch): Promise<GenerateResult> {
  const draftRaw = await callLlm(draftPrompt(jd), env, f);
  const draft = extractTex(draftRaw);
  if (!draft) throw new Error("drafter returned no usable .tex");

  let tex = draft;
  let reviewed = false;
  if (reviewEnabled(env)) {
    const reviewRaw = await callLlm(reviewPrompt(jd, draft), env, f);
    const corrected = extractTex(reviewRaw);
    if (corrected) {
      tex = corrected;
      reviewed = true;
    } else {
      console.error("reviewer output unparseable, keeping draft");
    }
  }

  let invented = findInventedNumbers(tex, MASTER_RESUME);
  // One corrective pass targeting the exact fabricated tokens. Resume integrity is
  // the whole point, so a hallucinated stat is worth a second call to kill. Single
  // shot, no loop: if it still slips through we return it flagged, not forever.
  if (invented.length) {
    console.error(`generate: invented numbers not in master: ${invented.join(", ")}, running corrective pass`);
    const fixedRaw = await callLlm(correctPrompt(jd, tex, invented), env, f);
    const fixed = extractTex(fixedRaw);
    if (fixed) {
      tex = fixed;
      invented = findInventedNumbers(tex, MASTER_RESUME);
      if (invented.length) console.error(`generate: still invented after correction: ${invented.join(", ")}`);
    } else {
      console.error("corrective output unparseable, keeping flagged draft");
    }
  }
  return { tex, invented, reviewed };
}

// Trim an over-length resume to one page. The app compiles and counts pages (the
// worker can't), so it calls this when pageCount > 1. Still guards invented numbers,
// a trim shouldn't be a backdoor for the model to fabricate.
export async function trimTex(tex: string, pages: number, env: LlmEnv, f: typeof fetch = fetch): Promise<GenerateResult> {
  const raw = await callLlm(trimPrompt(tex, pages), env, f);
  const trimmed = extractTex(raw);
  if (!trimmed) throw new Error("trim returned no usable .tex");
  const invented = findInventedNumbers(trimmed, MASTER_RESUME);
  if (invented.length) console.error(`trim: invented numbers not in master: ${invented.join(", ")}`);
  return { tex: trimmed, invented, reviewed: false };
}
