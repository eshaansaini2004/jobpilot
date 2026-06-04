export type Platform = "greenhouse" | "lever" | "ashby" | "workday" | "amazon" | "eightfold" | "browser";

export interface Company {
  name: string;
  platform: Platform;
  token: string; // board token / slug (workday: tenant; eightfold: domain; browser: parse shape "google"/"apple"/"meta"/"generic")
  tier: 1 | 2 | 3;
  // workday, and eightfold (reuses host for the API host)
  host?: string; // workday: "nvidia.wd5.myworkdayjobs.com"; eightfold: "explore.jobs.netflix.net"
  site?: string; // workday only, e.g. "nvidiaexternalcareersite"
  query?: string; // eightfold only: narrows a giant board (e.g. "new grad") to stay under the subrequest cap
  url?: string; // browser (tier 3): careers page to render
  selector?: string; // browser (tier 3): CSS anchor selector; falls back to a generic one
}

export interface Job {
  id: string;
  title: string;
  location: string;
  url: string;
  company: string;
  // Job description / qualifications, when the adapter gets it for free in the
  // list call (greenhouse/lever/ashby/amazon). Used to drop title-clean but
  // senior-by-experience roles. Absent for browser/eightfold cards.
  description?: string;
}

export const jobKey = (j: Job) => `${j.company}:${j.id}`;
