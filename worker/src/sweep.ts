import { REGISTRY } from "./registry.ts";
import { fetchCompany } from "./adapters/index.ts";
import { jobKey, type Company, type Job } from "./types.ts";

export interface SweepResult {
  total: number;
  fresh: Job[];
  errors: string[];
  swept: string[]; // company names that fetched successfully this run
}

// Pure sweep: takes the set of already-seen job keys, mutates it with what's live now,
// returns the jobs that weren't seen before. No KV, no Discord — callers wrap those.
export async function sweep(seen: Set<string>, registry: Company[] = REGISTRY): Promise<SweepResult> {
  // Keep only unseen jobs, and let each company's full response (descriptions and
  // all) fall out of scope before the next fetch. Accumulating every board at once
  // was ~50MB of retained heap against the 128MB Worker limit; now the peak is one
  // board transiently plus the (small) set of genuinely-new jobs.
  const fresh: Job[] = [];
  const errors: string[] = [];
  const swept: string[] = [];
  let total = 0;
  for (const c of registry) {
    try {
      const jobs = await fetchCompany(c);
      swept.push(c.name);
      total += jobs.length;
      for (const j of jobs) {
        const k = jobKey(j);
        if (!seen.has(k)) {
          fresh.push(j);
          seen.add(k);
        }
      }
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  return { total, fresh, errors, swept };
}
