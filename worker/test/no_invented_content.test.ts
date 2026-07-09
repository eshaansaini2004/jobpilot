// The no-invented-content gate. Hard asserts (nonzero exit on any failure):
//   - the gold-standard Salesforce resume + the General references are CLEAN
//     (proves the extractor targets content numbers, not LaTeX formatting)
//   - a fabricated number is FLAGGED (73%, 5,200 users)
//   - a mid-string prefix is REJECTED (6,553 must not hide inside master's 65,536)
//
// The full-corpus sweep is INFORMATIONAL. Some human-approved outputs round a
// metric (master "242x" written as "240x") or use the real Jan 2027 grad year
// (master says Dec 2026). That drift is exactly what a strict gate should show,
// so it's printed, not asserted — the point is that only real content numbers
// surface, never a stripped "2pt"/"0.4in".
//
// Optional: pass a .tex path as argv[2] to check one generated file directly.
//   node test/no_invented_content.test.ts /path/to/generated.tex
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findInventedNumbers } from "../src/validate.ts";

const RT = join(homedir(), "resume-tailor");
const master = readFileSync(join(RT, "master_resume.md"), "utf8");
const texDir = join(RT, "tex");
const read = (f: string) => readFileSync(join(texDir, f), "utf8");

const single = process.argv[2];
if (single) {
  const bad = findInventedNumbers(readFileSync(single, "utf8"), master);
  if (bad.length) {
    console.error(`FAIL: invented numbers in ${single}: ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS: no invented numbers in ${single}`);
  process.exit(0);
}

let ok = true;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) ok = false;
};

// --- Informational corpus sweep ---
console.log("--- corpus sweep (informational: shows rounding/grad-date drift) ---");
for (const f of readdirSync(texDir).filter((f) => f.endsWith(".tex"))) {
  const bad = findInventedNumbers(read(f), master);
  console.log(bad.length ? `  drift ${f}: ${bad.join(", ")}` : `  clean ${f}`);
}

// --- Hard asserts ---
console.log("\n--- asserts ---");

// Gold standard + General references must be spotless.
for (const f of [
  "resume_Salesforce_SoftwareEngineeringAMTS.tex",
  "resume_General.tex",
  "resume_General_SoftwareEngineer.tex",
]) {
  const bad = findInventedNumbers(read(f), master);
  assert(bad.length === 0, `${f} clean (got: ${bad.join(", ") || "none"})`);
}

// Negative case: fabricated numbers get caught.
const tampered = read("resume_Salesforce_SoftwareEngineeringAMTS.tex").replace(
  "\\textbf{50\\%}",
  "\\textbf{73\\%} for \\textbf{5,200 users}",
);
const caught = findInventedNumbers(tampered, master);
assert(caught.includes("73") && caught.includes("5200"), `fabricated 73/5200 flagged (got: ${caught.join(", ")})`);

// Boundary case: a prefix of a longer master integer must NOT pass.
const bnd = findInventedNumbers("\\begin{document} \\textbf{6,553}x speedup", master);
assert(bnd.includes("6553"), "6553 rejected despite 65536 in master");

// Rounding tolerance still works for decimals.
const dec = findInventedNumbers("\\begin{document} F1 0.92 and 0.98 ROC-AUC", master);
assert(dec.length === 0, `decimal rounding 0.92/0.98 accepted (got: ${dec.join(", ")})`);

if (!ok) {
  console.error("\nFAIL: no-invented-content validator");
  process.exit(1);
}
console.log("\nPASS: no-invented-content validator");
