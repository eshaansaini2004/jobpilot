import type { Company, Job } from "../types.ts";

// Eightfold ATS. Generic: host + domain (token) come from the Company config,
// so other Eightfold instances can be added by config alone. Netflix is the
// only tier-2 one — Microsoft is also Eightfold but needs a browser (tier 3).
// The API hard-caps at 10 positions per request regardless of `num`, so page
// through `start` until we've collected `count`. t_create/t_update are unix-
// second posting timestamps; pipeline diffs by id.
export async function fetchEightfold(c: Company): Promise<Job[]> {
  if (!c.host) throw new Error(`eightfold ${c.name}: host required`);
  const jobs: Job[] = [];
  let start = 0;
  // Optional query narrows a huge board so we don't page all of it (and blow the
  // free-tier 50-subrequest cap). Eightfold's query is a loose relevance match, so
  // filter.ts still does the real narrowing downstream.
  const q = c.query ? `&query=${encodeURIComponent(c.query)}` : "";
  // ponytail: 200-page ceiling (~2000 jobs) so a giant tenant can't spin
  // forever. Raise it if a bigger board lands here.
  for (let page = 0; page < 200; page++) {
    const res = await fetch(
      `https://${c.host}/api/apply/v2/jobs?domain=${c.token}&start=${start}&num=10${q}`,
    );
    if (!res.ok) throw new Error(`eightfold ${c.name}: ${res.status}`);
    const data = (await res.json()) as { positions?: any[]; count?: number };
    const positions = data.positions ?? [];
    for (const j of positions) {
      jobs.push({
        id: String(j.id),
        title: j.name,
        location: j.location ?? "",
        url: j.canonicalPositionUrl ?? `https://${c.host}/careers/job/${j.id}`,
        company: c.name,
      });
    }
    start += 10;
    if (positions.length < 10 || start >= (data.count ?? 0)) break;
    // Eightfold caps at 10/page and WAFs bursts. Space the pages out.
    await new Promise((r) => setTimeout(r, 150));
  }
  return jobs;
}
