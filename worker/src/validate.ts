// Guards the hardest constraint: a generated resume may only contain numbers,
// metrics, percentages, and dates that appear in the master resume. Anything
// invented (a made-up percentage, a fabricated user count) must be caught.
//
// Approach: extract number tokens from the tex BODY (LaTeX formatting measures
// stripped), then check each against the set of number tokens in the master.
// A token passes if it exactly matches a master token OR a master token starts
// with it (the legit rounding case: "0.92" from master's "0.924"). A token that
// only appears mid-string in a longer master number is rejected, so a fabricated
// "6,553" can't hide inside master's "65,536".

const NUM = /-?\d[\d,]*(?:\.\d+)?/g;

// Pull the number tokens out of a normalized string (commas removed).
function numberTokens(text: string): string[] {
  const norm = text.replace(/,/g, "");
  return norm.match(NUM)?.map((t) => t.replace(/^-/, "")) ?? [];
}

// Strip everything that carries formatting numbers rather than resume content:
// the preamble, LaTeX length units (2pt, 0.4in, 2.6em), \vspace/\\[..]/\rule.
function contentBody(tex: string): string {
  const start = tex.indexOf("\\begin{document}");
  let body = start >= 0 ? tex.slice(start) : tex;
  body = body
    .replace(/\\vspace\{[^}]*\}/g, " ")
    .replace(/\\\\\[[^\]]*\]/g, " ")
    .replace(/\\rule\{[^}]*\}\{[^}]*\}/g, " ")
    .replace(/-?\d[\d.]*\s*(pt|in|em|ex|cm|mm|px|bp)\b/g, " ");
  return body;
}

/**
 * Returns the list of number tokens in `tex` that do not appear in `master`.
 * Empty list means clean. Non-empty means a number was invented or mis-rounded.
 */
export function findInventedNumbers(tex: string, master: string): string[] {
  const masterSet = new Set(numberTokens(master));
  const masterArr = [...masterSet];
  const bad: string[] = [];
  for (const tok of numberTokens(contentBody(tex))) {
    if (masterSet.has(tok)) continue;
    // rounding tolerance for DECIMALS only: master "0.924" covers tex "0.92".
    // Not for integers — that would let "6553" hide inside master's "65536".
    if (tok.includes(".") && masterArr.some((m) => m.startsWith(tok))) continue;
    bad.push(tok);
  }
  return [...new Set(bad)];
}
