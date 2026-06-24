import { fetchAmazon } from "../src/adapters/amazon.ts";
import { fetchEightfold } from "../src/adapters/eightfold.ts";
import type { Company } from "../src/types.ts";

// W2 verify: hit both live endpoints through the adapters. Assert each returns
// parseable jobs with non-empty id/title/url, and confirm the raw response
// carries a usable posted-date field (pipeline diffs by id, but the plan wants
// each source to expose one).

function assertJobs(name: string, jobs: { id: string; title: string; url: string }[]) {
  if (jobs.length === 0) {
    console.error(`FAIL: ${name} returned 0 jobs`);
    process.exit(1);
  }
  for (const j of jobs) {
    if (!j.id || !j.title || !j.url) {
      console.error(`FAIL: ${name} job missing field: ${JSON.stringify(j)}`);
      process.exit(1);
    }
  }
  console.log(`PASS: ${name} → ${jobs.length} jobs, all have id/title/url`);
}

// Amazon
const amazon: Company = { name: "Amazon", platform: "amazon", token: "amazon", tier: 2 };
const amazonJobs = await fetchAmazon(amazon);
assertJobs("amazon", amazonJobs);
const amazonRaw = await (
  await fetch(
    "https://www.amazon.jobs/en/search.json?result_limit=1&sort=recent&normalized_country_code[]=USA",
  )
).json();
if (!amazonRaw.jobs?.[0]?.posted_date) {
  console.error("FAIL: amazon raw response has no posted_date");
  process.exit(1);
}
console.log(`PASS: amazon posted_date present ("${amazonRaw.jobs[0].posted_date}")`);

// Netflix (eightfold, generic host+domain)
const netflix: Company = {
  name: "Netflix",
  platform: "eightfold",
  token: "netflix.com",
  host: "explore.jobs.netflix.net",
  tier: 2,
};
const netflixJobs = await fetchEightfold(netflix);
assertJobs("netflix", netflixJobs);
const nfRaw = await (
  await fetch("https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&start=0&num=1")
).json();
if (!nfRaw.positions?.[0]?.t_create) {
  console.error("FAIL: netflix raw response has no t_create");
  process.exit(1);
}
console.log(`PASS: netflix t_create present (${nfRaw.positions[0].t_create})`);
// The API caps at 10/page — the adapter must page through all `count` jobs, or
// new roles past position 10 never fire. This is the check pagination breaks.
if (netflixJobs.length < nfRaw.count) {
  console.error(`FAIL: netflix returned ${netflixJobs.length} but count is ${nfRaw.count} — pagination truncated`);
  process.exit(1);
}
console.log(`PASS: netflix paged all ${netflixJobs.length} of ${nfRaw.count} jobs`);

console.log("PASS: tier 2 adapters green");
