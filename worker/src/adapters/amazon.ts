import type { Company, Job } from "../types.ts";

// Amazon has one global search.json with ~10k US roles, mostly warehouse/ops
// churn. Unqueried, the recent-100 window is all ops and software roles fall
// out between sweeps — so scope the query to software. filter.ts still does the
// new-grad/seniority narrowing downstream. posted_date ("August 11, 2026") is
// the usable posting date, though the pipeline diffs by id.
// ponytail: top-100 recent software roles, no pagination. Fine while Amazon's
// software posting rate stays under ~100/hour. Add offset paging if it bites.
export async function fetchAmazon(c: Company): Promise<Job[]> {
  const url =
    "https://www.amazon.jobs/en/search.json?result_limit=100&sort=recent&normalized_country_code[]=USA&base_query=software+engineer";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`amazon: ${res.status}`);
  const data = (await res.json()) as { jobs?: any[] };
  return (data.jobs ?? [])
    .filter((j) => j.country_code === "USA")
    .map((j) => ({
      id: String(j.id_icims),
      title: j.title,
      location: j.normalized_location ?? j.location ?? "",
      url: `https://www.amazon.jobs${j.job_path}`,
      company: c.name,
      // basic_qualifications is where Amazon states the years-of-experience floor.
      description: j.basic_qualifications ?? "",
    }));
}
