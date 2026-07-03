import { MASTER_RESUME, BEST_PRACTICES, GOLD_PREAMBLE, GOLD_EXAMPLE } from "./assets.ts";

// Scraped JD pages (Workday especially) can be tens of KB of boilerplate. Cap it
// so the combined prompt stays inside the weakest BYO model's context window.
export const MAX_JD_CHARS = 12000;

export function clampJd(jd: string): string {
  return jd.length > MAX_JD_CHARS ? jd.slice(0, MAX_JD_CHARS) : jd;
}

// The rules, lifted verbatim from the CONTENT + FORMATTING sections of
// ~/.claude/commands/tailor.md (Steps 3-4). The agent-only workflow steps (run
// the JD scraper, compile-and-recompile until one page, pdftotext fill-checkers,
// aux cleanup, the tracker CSV) are intentionally left out: a single LLM call
// can't run bash or see a compiled page. One-page enforcement is done outside
// this prompt by the app's compile-trim loop. Numbered so reviewers can cite.
const RULES = `You tailor Eshaan Saini's master resume to a specific job description and
output a single complete, compilable LaTeX file. New grad resume targeting
full-time roles after a May-Aug 2026 IBM internship. Graduation: Jan 2027.

HARD RULES:

1. SOURCE OF TRUTH. Use ONLY experience, projects, skills, and numbers from the
   master resume below. NEVER invent a metric, percentage, count, or date. Use the
   EXACT number from the master (write "242x", never round to "240x"). A number not
   in the master fails an automated check.

2. NO em dashes anywhere in the resume. No "--", no "---", no \\textemdash.
   Restructure the sentence instead. ("--" is allowed only inside date ranges like
   "May 2026 -- Aug 2026".)

3. PREAMBLE IS FIXED. Reproduce the preamble and header below BYTE-FOR-BYTE:
   geometry (bottom 0.38in), \\titlespacing{...}{5pt}{2pt}, topsep=0pt, parskip=1pt,
   the indented bullet list (leftmargin=2.6em, labelsep=0.8em, label={\\small\\textbullet}),
   the \\setlist[itemize,2] line, \\textbar{} separators (NEVER $|$, that is math mode
   and breaks the ATS no-math rule). Only swap JD-specific CONTENT: coursework, skill
   bolding, bullet text, which projects. Do NOT change structure, spacing, dates, or
   the header.

4. EXPERIENCE order: IBM -> H-E-B -> Vector Edge -> Peer Teacher. Keep all roles. 3
   bullets each for IBM/H-E-B/Vector Edge, front-loaded with the most JD-relevant
   work, past tense. Shape: \\textbf{Company} -- \\textit{Role}, City \\hfill Dates,
   then a flat itemize.

5. PEER TEACHER: present tense, EXACTLY 2 bullets, each filling ~2 full lines
   (semicolon-joined so each bullet carries two related ideas: the lab/tutoring work,
   then the office-hours or faculty-collaboration detail). Never a third bullet.

6. PROJECTS: pick 3-4 that best match the JD's domain and stack. HARD CAP 4. A 5th is
   always weaker than making the other 4 stronger. Drop irrelevant ones entirely, do
   not mention them. Each project is the bold name on its OWN line, then \\vspace{-2pt},
   then a flat itemize of 2-3 bullets (capstone Stackbox earns 3, others 2-3). No
   description trailing the name, no nesting. Never write a project as a single 4-line
   run-on paragraph. Projects are ACHIEVEMENTS, not feature lists: if a bullet tours
   what the thing contains ("four layers: A, B, C, D"), rewrite it around what it
   accomplished and at what scale. Enumerate at most two components, then spend the
   rest of the line on the result. A bullet with no number, no user count, and no
   outcome fails the "so what?" test, cut it or find the number in the master.

7. FILL THE LINE (the rule Eshaan cares most about). Every bullet, in experience AND
   projects, must fill its width: either one line that runs near the right margin, or
   two lines whose SECOND line is also reasonably full. The enemy is a last line that
   is a short ragged tail, or a half-empty single line. A single full line is ideal.
   Two traps: (1) bold text renders WIDER than plain, so a bullet near the one-line
   boundary wraps one word into a tiny orphan tail, trim well clear of the edge; (2)
   NO BULLET EXCEEDS 2 LINES, the 2.6em indent narrows the column so bullets that fit
   two lines at a wider margin can spill to three, keep every bullet to 2 lines or 1.
   No single dangling orphan word on its own line, reword to pull it up or fill the
   line at least halfway. DENSITY: a two-line bullet costs twice the height of a
   one-line bullet, and the whole resume must fit one page. Write MOST bullets as a
   single full line. At most about a third of your bullets may wrap to two lines,
   reserve those for your strongest, most JD-relevant points. If a bullet is drifting
   to two lines for a minor point, cut it to one line.

8. SKILLS: two flat comma-separated bullets. The FIRST bullet must be EXACTLY 2 lines,
   no more, no less. If it wraps to 3, trim lower-priority skills (drop Vercel,
   WebSocket, Nginx, scikit-learn, Flask, Playwright before cutting anything
   substantial, never cut languages or major frameworks). If it is only 1 line, add
   more tools/frameworks back. Certs on the second bullet. No bold category labels
   ("Languages:" etc.).

9. BOLDING: aim for 2-4 \\textbf per bullet, max 4, only on things worth a recruiter's
   eye stopping on. GOOD bolds: metrics and numbers (\\textbf{8 Cypress}, \\textbf{50\\% increase},
   \\textbf{90,000+}), specific tech/tool names (\\textbf{Angular}, \\textbf{AWS Cognito},
   \\textbf{Docker}), algorithm/API proper nouns (\\textbf{Aho-Corasick}, \\textbf{Google RE2}),
   named course/project titles (\\textbf{Honors Computer Architecture}). BAD bolds: generic
   verbs, soft phrases, filler, never bold "office hours", "onboarding", "pattern
   matching", "reducing testing time". Count them: more than 4 in a bullet means
   rewrite it. Bold only the specific words, never wrap an entire bullet or line in
   \\textbf{}. Tie multi-word bolds so they never split across lines: \\textbf{Mapbox~GL},
   \\textbf{AWS~Cognito}, \\textbf{Duo~MFA}, \\textbf{Secrets~Manager}, \\textbf{AWS~Lambda}.

10. ATS (non-negotiable): no math-mode characters anywhere ($|$, $\\sim$, etc.), write
    it out ("under 0.5ms", "approximately 40%"). No tables, multi-column layouts, text
    boxes, images. Section names EXACTLY: EDUCATION, TECHNICAL SKILLS AND CERTIFICATIONS,
    EXPERIENCE, PROJECTS. All contact info in the document body. Escape & % # _ as
    \\& \\% \\# \\_. Use \\hfill to push dates right. Wrap all URLs in \\href{url}{display}.

11. KEYWORDS + JARGON: mirror the JD's exact phrasing (if they say "distributed
    systems", write "distributed systems", not "scalable architecture"). Keep
    well-known tech as proper nouns (Mapbox, PostgreSQL, Docker, FastAPI), those are
    keywords. But SIMPLIFY implementation jargon: if a term describes HOW something was
    built internally (algorithm name, math concept, obscure library method) rather than
    what it does, replace it with plain English a recruiter (a CS grad, not a
    specialist) grasps in 3 seconds. E.g. "radial line-polygon intersection algorithms"
    -> "per-tenant floor overlays"; "cosine similarity via sentence-transformers" ->
    "embedding-based semantic matching"; "JWKS-based lru_cache key fetching" -> "cached
    JWT validation".

12. NEW GRAD: no Objective or Summary section. GPA 4.0 and Dean's Honor Roll always
    appear, it is a differentiator. Coursework: keep only courses directly relevant to
    this JD. No Extracurriculars section, ever.

13. ONE PAGE. The resume must fill to the bottom margin and stay on a single page. If
    sparse, expand bullets to full lines, restore trimmed detail, or add a 4th project,
    do NOT add a 5th. If over one page, cut by RELEVANCE not position: score each bullet
    on how directly it maps to the JD's required skills and whether it says something no
    other bullet says, then cut the lowest scorer (a duplicate bullet in a recent role
    beats a unique one in an old role). Do not reflexively drop the oldest role or last
    project.

OUTPUT: the complete .tex file and NOTHING else. Start at \\documentclass, end at
\\end{document}. No markdown fences, no commentary.`;

export interface Turn {
  system: string;
  user: string;
}

export function draftPrompt(jd: string): Turn {
  return {
    system: RULES,
    user: `MASTER RESUME (source of truth):
${MASTER_RESUME}

BEST PRACTICES:
${BEST_PRACTICES}

PREAMBLE + HEADER to reproduce byte-for-byte (then continue with the tailored
EDUCATION, TECHNICAL SKILLS AND CERTIFICATIONS, EXPERIENCE, and PROJECTS sections,
ending with \\end{document}):
${GOLD_PREAMBLE}

LENGTH TEMPLATE. Below is a COMPLETE approved resume tailored to a DIFFERENT job.
It compiles to exactly ONE page. Use it ONLY to calibrate length and density, NOT
content. Study how SHORT and tight its bullets are, most are a single line, and match
that tightness, that is why it fits. Match its number of projects and bullets. Do NOT
copy its JD-specific wording or project selection, tailor to the job below using the
master resume. The single most common failure is bullets that run wordy and wrap to a
second line, pushing to page 2. Keep your bullets as tight as this example's:
${GOLD_EXAMPLE}

JOB DESCRIPTION:
${clampJd(jd)}

Write the complete tailored .tex now.`,
  };
}

// Corrective pass: the validator found numbers not in the master resume. Name
// them and make the model remove or replace each with a master-backed fact. Fires
// only on a violation, so clean drafts never pay for it.
export function correctPrompt(jd: string, tex: string, invented: string[]): Turn {
  return {
    system: `${RULES}

The draft below contains FABRICATED numbers that do NOT appear in the master
resume. This violates rule 1 and will fail an automated check. For EACH flagged
number, either remove it and rephrase the sentence, or replace it with a real
value from the master resume. Do not invent a different number. Change nothing
else. Output the corrected complete .tex and nothing else.`,
    user: `MASTER RESUME (source of truth):
${MASTER_RESUME}

FABRICATED numbers to fix (none of these are in the master): ${invented.join(", ")}

DRAFT TO CORRECT:
${tex}

Return the corrected complete .tex now.`,
  };
}

// Trim pass: the app compiled the resume and it ran over one page. The model can't
// see pages, so the app measures and calls this with the over-length .tex. The
// overflow is almost always small (a few lines), so TIGHTEN before you CUT: the
// goal is to lose wrapped lines, not accomplishments.
export function trimPrompt(tex: string, pages: number): Turn {
  return {
    system: `${RULES}

The resume below compiled to ${pages} pages. It MUST fit one page. Shaving words off
2-line bullets does NOT work: a bullet that wraps stays 2 lines until you remove a
whole line of height, so you must REMOVE content, not reword it. Remove roughly
${(pages - 1) * 8} lines of height by cutting the LEAST JD-relevant material, in this
order, and stop once it will fit:
1. If there are 4 projects, drop the single least JD-relevant one entirely (its name
   and all its bullets). Going from 4 projects to 3 reliably reclaims a page.
2. Otherwise delete the weakest, most duplicative individual bullets (a bullet that
   repeats a point another bullet already makes, or is least tied to the JD's required
   skills). Whole bullets, not words.
Follow rule 13: cut by relevance, never by position, never drop the newest role. Keep
every remaining bullet and number exactly as-is, do NOT touch the preamble, do NOT
invent anything. Output the complete corrected .tex and nothing else.`,
    user: `RESUME TO FIT ON ONE PAGE (remove the least-relevant content, do not reword):
${tex}

Return the corrected complete .tex now.`,
  };
}

// Reviewer pass: hand back a corrected full .tex, citing the rules above.
export function reviewPrompt(jd: string, draftTex: string): Turn {
  return {
    system: `${RULES}

You are now REVIEWING a draft against these rules. Fix every violation:
invented/rounded numbers (rule 1), em dashes (rule 2), preamble drift (rule 3),
wrong bullet counts (rules 4-6), bullets over 2 lines or with ragged tails
(rule 7), a skills first-bullet that isn't 2 lines (rule 8), over-bolding
(rule 9), math-mode or unescaped chars (rule 10). Output the corrected complete
.tex and nothing else. If the draft is already clean, return it unchanged.`,
    user: `JOB DESCRIPTION:
${clampJd(jd)}

DRAFT TO REVIEW AND CORRECT:
${draftTex}

Return the corrected complete .tex now.`,
  };
}
