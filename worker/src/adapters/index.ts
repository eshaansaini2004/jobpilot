import type { Company, Job } from "../types.ts";
import { fetchGreenhouse } from "./greenhouse.ts";
import { fetchLever } from "./lever.ts";
import { fetchAshby } from "./ashby.ts";
import { fetchWorkday } from "./workday.ts";
import { fetchAmazon } from "./amazon.ts";
import { fetchEightfold } from "./eightfold.ts";

const ADAPTERS: Record<string, (c: Company) => Promise<Job[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  workday: fetchWorkday,
  amazon: fetchAmazon,
  eightfold: fetchEightfold,
};

export function fetchCompany(c: Company): Promise<Job[]> {
  const fn = ADAPTERS[c.platform];
  if (!fn) throw new Error(`no adapter for platform ${c.platform}`);
  return fn(c);
}
