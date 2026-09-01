import type { Job } from "./types.ts";

// New-grad software roles, US-based. Heuristics — tune as noise shows up.
// ponytail: a couple of regexes and a block list. Fix false hits here, not with
// per-company special cases.

// Software-specific titles only. Bare "engineer"/"developer" pulls in IT, finance,
// sales, data roles, so match the software phrasings explicitly. "Member of technical
// staff" is what Anthropic/OpenAI call their SWE roles.
// \b after "engineer"/"developer" so a team name like "...Platform Engineering"
// doesn't match "platform engineer".
const INCLUDE_TITLE =
  /software engineer\b|software developer\b|\bswe\b|full.?stack|back.?end|front.?end|backend|frontend|machine learning engineer\b|\bml engineer\b|infrastructure engineer\b|platform engineer\b|mobile engineer\b|ios engineer\b|android engineer\b|web developer\b|member of technical staff/i;

// Seniority, non-new-grad, and non-software-domain signals.
// - (?<!technical )staff keeps "Member of Technical Staff" while dropping "Staff Engineer".
// - \bintern(ship)? matches "intern"/"internship" but not "internal".
// - finance/sales/etc. drop non-software roles that slip past the title include.
const EXCLUDE_TITLE =
  /senior|(?<!technical )staff|principal|\blead\b|manager|director|head of|\bvp\b|vice president|architect|\bsr\.?\b|\bintern(ship)?\b|fellowship|finance|accounting|\bsales\b|marketing|recruit|solutions engineer|support engineer|\b(?:engineer(?:ing)?|sde|developer)\s*l?\s*(?:iii|ii|iv|vi|v|[2-9])\b|\(l?\s*[2-9]\)/i;

// Obvious non-US locations. Drop on match.
const NON_US =
  /\b(germany|united kingdom|\buk\b|england|london|berlin|munich|ireland|dublin|france|paris|india|bangalore|bengaluru|hyderabad|pune|canada|toronto|vancouver|montreal|singapore|australia|sydney|melbourne|japan|tokyo|netherlands|amsterdam|poland|warsaw|krakow|brazil|mexico|spain|barcelona|portugal|lisbon|romania|bucharest|serbia|belgrade|israel|tel aviv|china|shanghai|korea|seoul|emea|apac|latam|\beurope\b)\b/i;

// Positive US signals: country name, "Remote", DC, or a "City, ST" pattern.
const US_HINT =
  /\b(united states|usa|u\.s\.?|remote|washington,?\s*d\.?c\.?|\bd\.c\.\b)\b|,\s*[A-Z]{2}\b/i;

// Minimum years-of-experience at or above which a role is not new-grad.
// Was 4, but Apple/Meta "new grad" cards turned up with 2+/3+ year floors in the
// quals text, so the real-world senior/mid floor starts lower than assumed.
// 2 still keeps genuine entry postings that cite "1+ years (internships count)".
const YOE_DROP_AT = 2;

// Decode the few HTML entities greenhouse content carries and strip tags, so
// "5&#43;&nbsp;years" reads the same as lever's plain "5+ years". Block/list
// boundaries become newlines BEFORE the generic tag strip -- otherwise
// "</li><li>" collapses to a single space and an entire bullet list reads as
// one run-on clause, which starves clauseAround() of a real boundary to stop at.
function plainText(s: string): string {
  return s
    .replace(/<\/?(?:li|p|div|br|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#43;/g, "+")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Soft-qualifier language ("Python experience preferred", "2+ years is a
// plus", "minimum 2 years, or equivalent for recent grads"). A match whose
// surrounding clause carries one of these isn't a hard floor, so it shouldn't
// count against a new grad who lacks it.
// "a plus" (not bare "plus") -- "plus" alone is also a common connective
// ("3+ years, plus knowledge of Kubernetes"), which is NOT a soft signal.
// No grad wording here on purpose: "new grad"/"recent grad" is a role LABEL,
// and the Apple/Meta postings this gate exists to catch carry that label right
// next to a hard floor. Same for "or equivalent" -- in practice it reads
// "3+ years of experience (or equivalent)", which is still a hard floor.
const SOFT_QUALIFIER =
  /preferred|nice.to.have|\ba\s+plus\b|bonus|desired|ideally|not required/i;

// The sentence/clause containing [start, end). Bounded by the nearest "."/"\n"
// (list items become "\n" in plainText above), with a generous 150-char
// backstop each side so one comma-separated bullet with no internal
// punctuation still keeps its trailing "(nice to have)" in view.
function clauseAround(text: string, start: number, end: number): string {
  let from = start;
  for (let i = start - 1; i >= Math.max(0, start - 150); i--) {
    if (text[i] === "." || text[i] === "\n") break;
    from = i;
  }
  let to = end;
  for (let i = end; i < Math.min(text.length, end + 150); i++) {
    if (text[i] === "." || text[i] === "\n") break;
    to = i + 1;
  }
  return text.slice(from, to);
}

// True when the description states a required experience floor >= YOE_DROP_AT.
// Only matches requirement-shaped phrasings ("N+ years ... experience",
// "minimum/at least N years ... experience") and takes the SMALLEST floor found,
// so a JD offering any low-experience path is kept. Errs toward keeping.
export function demandsSeniorExperience(description?: string): boolean {
  if (!description) return false;
  const text = plainText(description);
  const re =
    /(?:\b(\d{1,2})\s*\+|(?:minimum|min\.?|at least)\s*(?:of\s*)?(\d{1,2}))\s*years?\b[^.\n]{0,40}?\bexperience\b/gi;
  let min = Infinity;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1] ?? m[2]);
    if (SOFT_QUALIFIER.test(clauseAround(text, m.index, m.index + m[0].length))) continue;
    if (n < min) min = n;
  }
  return Number.isFinite(min) && min >= YOE_DROP_AT;
}

export interface Filters {
  blockedCompanies: Set<string>; // volume spammers, lowercased
}

export function isRelevant(job: Job, f: Filters): boolean {
  if (f.blockedCompanies.has(job.company.toLowerCase())) return false;

  const title = job.title ?? "";
  if (!INCLUDE_TITLE.test(title)) return false;
  if (EXCLUDE_TITLE.test(title)) return false;

  const loc = job.location ?? "";
  if (NON_US.test(loc)) return false;
  // Blank location is rare and usually a US HQ role; keep it. Anything with a
  // location must carry a US signal, else it's foreign noise we can't confirm.
  if (loc && !US_HINT.test(loc)) return false;

  // Last, on survivors only: a title-clean role whose quals demand 4+ years is
  // not new grad. Description is absent for browser/eightfold cards — those stay
  // title-only, which is the accepted ceiling.
  if (demandsSeniorExperience(job.description)) return false;
  return true;
}

export function filterJobs(jobs: Job[], f: Filters): Job[] {
  return jobs.filter((j) => isRelevant(j, f));
}
