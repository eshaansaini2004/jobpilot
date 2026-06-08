import type { Company, Job } from "../types.ts";

export async function fetchAshby(c: Company): Promise<Job[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${c.token}`);
  if (!res.ok) throw new Error(`ashby ${c.token}: ${res.status}`);
  const data = (await res.json()) as { jobs?: any[] };
  return (data.jobs ?? []).map((j) => ({
    id: String(j.id),
    title: j.title,
    location: j.location ?? "",
    url: j.jobUrl,
    company: c.name,
    description: j.descriptionPlain ?? "",
  }));
}
