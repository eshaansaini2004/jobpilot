import type { Company, Job } from "../types.ts";

export async function fetchGreenhouse(c: Company): Promise<Job[]> {
  // content=true returns each job's HTML description in the SAME request (no
  // extra subrequest), so the filter can read qualifications.
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs?content=true`);
  if (!res.ok) throw new Error(`greenhouse ${c.token}: ${res.status}`);
  const data = (await res.json()) as { jobs?: any[] };
  return (data.jobs ?? []).map((j) => ({
    id: String(j.id),
    title: j.title,
    location: j.location?.name ?? "",
    url: j.absolute_url,
    company: c.name,
    description: j.content ?? "",
  }));
}
