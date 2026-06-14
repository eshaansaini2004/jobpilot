import { sweep } from "../src/sweep.ts";
import { REGISTRY } from "../src/registry.ts";

// W0 verify: run the sweep twice against real boards. First run finds jobs,
// second run reports 0 new because every id is now in `seen`.
// Tier 1 only — tier2.test.ts owns the tier-2 adapters, and crawling Netflix's
// paged board here too would hammer its WAF across the suite.
const tier1 = REGISTRY.filter((c) => c.tier === 1);
const seen = new Set<string>();

const run1 = await sweep(seen, tier1);
console.log(`run 1: ${run1.total} live, ${run1.fresh.length} new`);
if (run1.errors.length) console.log(`  adapter errors: ${run1.errors.join("; ")}`);

const run2 = await sweep(seen, tier1);
console.log(`run 2: ${run2.total} live, ${run2.fresh.length} new`);

if (run1.fresh.length === 0) {
  console.error("FAIL: run 1 found no jobs — boards down or parsers broken");
  process.exit(1);
}
if (run2.fresh.length !== 0) {
  console.error(`FAIL: run 2 reported ${run2.fresh.length} new, expected 0`);
  process.exit(1);
}
console.log("PASS: second run reports 0 new");
