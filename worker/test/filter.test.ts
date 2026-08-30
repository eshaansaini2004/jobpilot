import { sweep } from "../src/sweep.ts";
import { REGISTRY } from "../src/registry.ts";
import { filterJobs, isRelevant, demandsSeniorExperience } from "../src/filter.ts";
import type { Job } from "../src/types.ts";

const noBlocks = { blockedCompanies: new Set<string>() };
const job = (title: string, location: string): Job => ({
  id: "x",
  title,
  location,
  url: "u",
  company: "Acme",
});

// Unit cases: the specific bugs we just fixed, pinned so they don't regress.
const cases: [string, string, boolean][] = [
  ["Software Engineer, New Grad", "San Francisco, CA", true],
  ["Full Stack Engineer", "New York City, NY", true],
  ["Member of Technical Staff", "Remote", true],
  ["Backend Engineer", "Washington, D.C.", true],
  ["Senior Software Engineer", "Austin, TX", false], // seniority
  ["Software Engineer Internship", "Chicago, IL", false], // intern(ship)
  ["Software Engineer", "Belgrade, Serbia", false], // foreign
  ["Software Engineer", "London, United Kingdom", false], // foreign
  ["IT Support Engineer", "San Francisco, CA", false], // not software
  ["Data Scientist", "New York City, NY", false], // not software
  ["Finance Systems Engineer", "Seattle, WA", false], // not software
  ["Software Engineer", "Bengaluru, India", false], // foreign
];

let unitOk = true;
for (const [title, loc, want] of cases) {
  const got = isRelevant(job(title, loc), noBlocks);
  const pass = got === want;
  if (!pass) unitOk = false;
  console.log(`${pass ? "PASS" : "FAIL"} want=${want} got=${got}  "${title}" @ ${loc}`);
}
if (!unitOk) {
  console.error("FAIL: filter unit cases");
  process.exit(1);
}

// Years-of-experience gate. Priority: NEVER drop a real new grad; letting some
// senior roles through is fine. So `true` = drop (clearly senior), `false` = keep.
const yoeCases: [string, boolean][] = [
  // Should DROP — clear senior floor >= 2
  ["Basic Qualifications: 5+ years of professional software development experience", true],
  ["Minimum of 6 years of experience building distributed systems", true],
  ["At least 4 years of industry experience", true],
  ["8+ years of software development experience", true],
  ["5&#43;&nbsp;years of experience with <b>Java</b>", true], // greenhouse HTML shape
  ["Minimum 3 years of experience", true], // Apple/Meta-shaped false positive we saw in prod
  // Bare ranges ("4-8 years") have no "+"/"minimum" floor marker, so they LEAK
  // through rather than risk a false drop. Accepted per priority: never lose a
  // new grad. Add floor-based range matching later if these get noisy.
  ["Requires 4-8 years of experience", false],
  // Should KEEP — genuine new grad / early career
  ["0-2 years of experience", false],
  ["1-3 years of relevant experience", false],
  ["1+ years of experience (internships count)", false], // below the floor, keep
  ["Bachelor's degree in Computer Science; no experience required", false],
  ["New grad. Graduating in 2026. 0-1 years of experience.", false],
  ["Our team has 15 years of combined experience shipping products", false], // not a requirement floor
  ["Founded 12 years ago", false], // no "experience" anchor near number
  // Mixed: senior floor present but a low-experience path also offered -> KEEP.
  // Needs a "minimum/at least" marker on the low side too, since bare "1 year"
  // (no "+"/"minimum") isn't matched at all -- see the "Requires 4-8 years" case.
  ["3+ years experience, OR a Master's degree with a minimum of 1 year of experience", false],
  // Soft-qualifier phrasing: a stated floor that's explicitly a nice-to-have,
  // not a requirement -- shouldn't disqualify a new grad who lacks it.
  ["2+ years of experience with Python preferred", false],
  ["Preferred: 3+ years of experience in distributed systems", false],
  ["Experience with Kubernetes (2+ years) is a plus", false],
  ["Prior internship experience is a bonus but not required", false],
  // But a hard requirement elsewhere in the same JD still drops it even if
  // another line happens to be a soft qualifier.
  [
    "5+ years of experience required. 2+ years of experience with Python preferred.",
    true,
  ],
  ["", false],
];
let yoeOk = true;
for (const [desc, want] of yoeCases) {
  const got = demandsSeniorExperience(desc);
  const pass = got === want;
  if (!pass) yoeOk = false;
  console.log(`${pass ? "PASS" : "FAIL"} drop=${want} got=${got}  "${desc.slice(0, 55)}"`);
}
if (!yoeOk) {
  console.error("FAIL: YOE gate cases");
  process.exit(1);
}

// Sanity against live data: filter should keep a sane fraction and no obvious junk.
const seen = new Set<string>();
// Tier 1 only — see sweep.test.ts. tier2.test.ts covers the tier-2 adapters.
const r = await sweep(seen, REGISTRY.filter((c) => c.tier === 1));
const kept = filterJobs(r.fresh, noBlocks);
console.log(`\nlive: ${r.total} jobs -> ${kept.length} kept`);

const junk = kept.filter(
  (j) =>
    /senior|(?<!technical )staff|principal|\bintern(ship)?\b|\blead\b|manager|director/i.test(j.title) ||
    /germany|london|india|canada|singapore|serbia|\beurope\b/i.test(j.location || ""),
);
console.log(`junk in kept: ${junk.length}`);
for (const j of junk.slice(0, 10)) console.log(`  ! [${j.company}] ${j.title} @ ${j.location}`);

console.log("\nsample kept:");
for (const j of kept.slice(0, 12)) console.log(`  [${j.company}] ${j.title} @ ${j.location || "(blank)"}`);

if (junk.length > 0) {
  console.error(`FAIL: ${junk.length} junk jobs passed the filter`);
  process.exit(1);
}
console.log("\nPASS: unit cases + no junk in live results");
