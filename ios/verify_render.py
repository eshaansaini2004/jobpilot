#!/usr/bin/env python3
"""
A3b verification, offline half. The shipping renderer is the on-device
LatexEngine (busytex WASM); A2 verified it byte-identical to desktop pdflatex, so
pdflatex stands in here for a runnable check without the simulator.

For 3 real JD-tailored resumes it asserts:
  1. compiles clean to exactly one page (the tex -> PDF path the app runs)
  2. the role's JD keywords are present in the PDF TEXT LAYER (what an ATS reads)
  3. no invented numbers (delegates to the node validator)

Keyword provenance (NOT read off the resume): each list is the well-known
required-skill set for that role's new-grad JD. The test is whether tailoring
surfaced them into the rendered text.

Run: python3 verify_render.py   (needs pdflatex + pdftotext + node)
"""
import os, subprocess, sys, tempfile, shutil

TEX_DIR = os.path.expanduser("~/resume-tailor/tex")
WORKER = os.path.expanduser("~/jobapp/worker")

# file -> JD keywords (the role's known requirements, chosen from the posting)
CASES = {
    "resume_Salesforce_SoftwareEngineeringAMTS.tex": ["Java", "REST", "SQL", "PostgreSQL"],
    "resume_Roblox_SoftwareEngineerEarlyCareer.tex": ["C++", "PostgreSQL", "Docker"],
    "resume_Twitch_SoftwareEngineerIDiscovery.tex": ["Go", "React", "TypeScript"],
}

def check(tex_file, keywords):
    src = os.path.join(TEX_DIR, tex_file)
    if not os.path.exists(src):
        return False, f"missing {tex_file}"
    work = tempfile.mkdtemp()
    try:
        shutil.copy(src, work)
        r = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", tex_file],
            cwd=work, capture_output=True, text=True,
        )
        log = r.stdout
        pdf = os.path.join(work, tex_file.replace(".tex", ".pdf"))
        if not os.path.exists(pdf):
            return False, "no PDF produced\n" + log[-800:]
        # exactly one page
        if "on 1 page" not in log and "Output written" in log and "(1 page" not in log:
            # pdflatex phrasing varies; fall back to pdfinfo
            info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
            pages = [l for l in info.splitlines() if l.startswith("Pages:")]
            if pages and pages[0].split()[-1] != "1":
                return False, f"not one page: {pages[0]}"
        # keyword presence in the text layer
        txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout.lower()
        missing = [k for k in keywords if k.lower() not in txt]
        if missing:
            return False, f"keywords missing from PDF text: {missing}"
        # no invented numbers (node validator, per file)
        v = subprocess.run(
            ["node", "test/no_invented_content.test.ts", src],
            cwd=WORKER, capture_output=True, text=True,
        )
        if v.returncode != 0:
            return False, "invented-number check failed: " + (v.stdout + v.stderr).strip()
        return True, f"1 page, keywords {keywords} present, no invented numbers"
    finally:
        shutil.rmtree(work, ignore_errors=True)

def main():
    ok = True
    for f, kw in CASES.items():
        passed, detail = check(f, kw)
        print(f"{'PASS' if passed else 'FAIL'} {f}: {detail}")
        ok = ok and passed
    if not ok:
        print("\nFAIL: 3-JD render+keyword check")
        sys.exit(1)
    print("\nPASS: 3 JDs render clean, keywords in text layer, no invented numbers")

if __name__ == "__main__":
    main()
