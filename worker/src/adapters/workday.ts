import type { Company, Job } from "../types.ts";

// Workday is the fiddly one: POST, and each company needs host + site, not just a token.
// token here is the tenant. host = "{tenant}.wdN.myworkdayjobs.com", path uses tenant + site.
export async function fetchWorkday(c: Company): Promise<Job[]> {
  if (!c.host || !c.site) throw new Error(`workday ${c.name}: host and site required`);
  const res = await fetch(`https://${c.host}/wday/cxs/${c.token}/${c.site}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    // ponytail: top 20, no pagination. A Workday tenant posting >20 roles between
    // sweeps could hide a new role past page 1, and default sort isn't guaranteed
    // newest-first. Add offset paging + a postedOn sort if a Workday company lands
    // on the watchlist and this bites.
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" }),
  });
  if (!res.ok) throw new Error(`workday ${c.name}: ${res.status}`);
  const data = (await res.json()) as { jobPostings?: any[] };
  return (data.jobPostings ?? []).map((j) => ({
    id: String(j.externalPath), // stable per posting; bulletFields is often the req id but not always present
    title: j.title,
    location: j.locationsText ?? "",
    url: `https://${c.host}${j.externalPath}`,
    company: c.name,
  }));
}
