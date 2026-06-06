import type { Company, Job } from "../types.ts";

export async function fetchLever(c: Company): Promise<Job[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${c.token}?mode=json`);
  if (!res.ok) throw new Error(`lever ${c.token}: ${res.status}`);
  const data = (await res.json()) as any[];
  return (data ?? []).map((j) => ({
    id: String(j.id),
    title: j.text,
    location: j.categories?.location ?? "",
    url: j.hostedUrl,
    company: c.name,
    // descriptionPlain is the intro; the requirements/quals live in additionalPlain.
    description: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join("\n"),
  }));
}
