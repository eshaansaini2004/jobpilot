# Eshaan Saini

eshaansaini2004@gmail.com | linkedin.com/in/eshaan2004 | github.com/eshaansaini2004 | eshaan-portfolio-ten.vercel.app

---

## Education

**Texas A&M University**, College Station, TX | B.S. Computer Science, Minor in Cybersecurity | Aug 2023 – Dec 2026
GPA: 4.0 | Dean's Honor Roll (4 semesters)
Relevant Coursework: Data Structures, Operating Systems, Parallel Computing, Computer Architecture, Networking, Machine Learning, Databases, Cloud Computing, Analysis of Algorithms, Computer and Network Security, Software Engineering

---

## Skills

**Languages:** Python, Java, C++, JavaScript, TypeScript, SQL, R, Haskell
**Frameworks & Libraries:** React, Next.js, Angular, Node.js, Express, FastAPI, Flask, Flask-SocketIO, PyTorch, scikit-learn, Material UI, Tailwind CSS, NetworkX, Plotly
**Tools & Platforms:** Git, Docker, AWS (RDS, S3, Cognito, EC2), PostgreSQL, MongoDB, Cypress, Linux, Webpack, Vite, Vercel, WebSocket, tree-sitter, Google RE2, Mapbox GL, Nginx, pm2
**APIs & Integrations:** Google Gemini API, Google Safe Browsing API, PhishTank API, Google OAuth, Notion API, OpenWeatherMap API, Cloudflare Workers
**Practices:** Agile, CI/CD, REST API design, test automation, Chrome Extension Manifest V3
**Certifications:** Building AI Agents with RAG and LangChain by IBM; Model Context Protocol (Introduction and Advanced Topics), Prompt Engineering, Claude Code 101, Claude Code in Action by Anthropic; Machine Learning by Andrew Ng (Stanford/Coursera), Python for Data Science, AI & Development by IBM

---

## Experience

### IBM | AI Engineering & Backend Development Intern | Austin, TX | May 2026 – Aug 2026

- Building an MCP server in Go over the IBM Cloud Logs API spanning all 13 PowerVS log environments (12 production regions plus staging); a cross-region investigation that previously required 13 separately authenticated API calls with manual per-region endpoint resolution now runs as a single tool call, retrieving logs roughly 3x faster than manual per-region retrieval.
- Developing an AI diagnostic agent running locally on Gemma 4 26B A4B that runs log queries through the MCP server and generates structured root-cause analysis reports, cutting initial case triage from 2 hours to 10 minutes versus manual evidence gathering.
- Designing a RAG knowledge base over anonymized historical support cases so the agent surfaces similar past incidents during live diagnosis.

### Texas A&M University | Peer Teacher | College Station, TX | Aug 2025 – Present

- Lead weekly lab sessions for 30+ students in Honors Computer Architecture and Computer Systems, fielding questions on low-level concepts and holding office hours for individualized support.
- Tutor students 1-on-1 in Data Structures, covering trees, graphs, hash maps, and algorithm complexity through dedicated office hours and Piazza engagement.
- Support foundational CS courses (Computer Architecture, Computer Systems, and others) and collaborate with faculty to align lab content with lecture material on topics like memory hierarchy, pipelining, and systems programming.

### H-E-B | Software Development Intern | San Antonio, TX | June 2025 – Aug 2025

- Created 8 large Cypress automated end-to-end test suites, each spanning multiple test cases, covering key counterfeit coupon workflows (create, update, delete) in the H-E-B Coupon Creation modal, cutting manual testing time before deployment by roughly one month.
- Modified Angular frontend components to fix bugs in the Counterfeit Coupons tab and built REST API endpoints for secure, efficient data access during testing workflows.
- Spearheaded an overhaul of the engineering onboarding process by auditing docs, removing redundant steps, and producing updated documentation, leading to a 50% increase in onboarding efficiency.

### Vector Edge | Software Development Intern | Austin, TX | June 2024 – July 2024

- Implemented Google RE2 regex and the Aho-Corasick Algorithm within a classification SDK to identify PII, PFI, and PHI across large text datasets, matching every sensitive-data pattern in a single linear pass.
- Built a context-based evaluation layer that assigns confidence scores to sensitive-keyword matches, improving detection accuracy by over 40%.
- Contributed to porting the SDK from Windows to macOS/Linux, expanding the addressable client base by 10%.

---

## Projects

### JobPilot | iOS job-application autopilot (in development, not yet released)

**Stack:** Swift, SwiftUI, WKWebView, Cloudflare Workers, Claude API, pdfTeX compiled to WebAssembly, Greenhouse / Lever / Ashby / Workday job APIs

Native iOS app that finds relevant openings, tailors a resume to each posting, and autofills the application without leaving the phone.
- Tracks company job boards through a Cloudflare Worker and covers 91% of 3,402 employers across Greenhouse, Lever, Ashby, and Workday (target coverage; not yet validated end-to-end)
- Tailors a resume to each posting with the Claude API, then renders the PDF on-device by running pdfTeX compiled to WebAssembly, so no backend server is needed
- Autofills applications inside an embedded WKWebView, keeping the full flow from tailoring to submission on-device

### GPU & Parallel Computing | CSCE 435 Parallel Computing (CUDA / MPI / pthreads)

**Stack:** C, C++, CUDA, MPI, OpenMP, pthreads, NVIDIA A100 and T4 GPUs, QEMU

Coursework building and benchmarking parallel algorithms across GPU, distributed, and shared-memory models.
- CUDA closest-pair (minimum distance) kernel with shared-memory tree reduction and a single-pass atomic last-block finish; ~242x faster than a sequential CPU baseline on an NVIDIA A100 at 65,536 points (9.45ms vs 2288ms), zero relative error, scaling toward 1M points
- MPI hypercube quicksort (bit-flip partner exchange, pivot broadcast) and a distributed Monte Carlo pi estimator across ranks
- Shared-memory parallelism: a custom pthreads barrier (mutex + condition variables) and parallel list-reduction primitives (mean, standard deviation, minimum), plus an OpenMP grid simulation that parallelizes a cellular-automaton search to locate a hidden source point
- Also completed a written comparison of leading supercomputers (El Capitan, Aurora) covering interconnect, memory hierarchy, and performance tradeoffs

### Operating Systems | xv6 Kernel Development (RISC-V)

**Stack:** C, RISC-V assembly, xv6, QEMU, GDB

Extended the xv6 teaching kernel across memory management, scheduling, threading, and the file system (course grade: A).
- Memory: lazy page allocation and copy-on-write fork with per-physical-page reference counting; page-table access-bit scanning and merging contiguous 4KiB pages into 2MiB huge pages to reduce TLB misses
- CPU and threads: kernel threading via a clone() syscall with per-thread trapframes over a shared address space, plus user-level timer interrupt handlers (sigalarm/sigreturn)
- Syscalls and FS: added system calls (trace, sysinfo) through the user/kernel stub path; doubly-indirect inode blocks raising max file size to 65,803 blocks; symbolic links with cycle detection

### Buffer Overflow Exploitation | SEED Set-UID Lab (x86 / x86-64 Linux)

**Stack:** C, x86/x86-64 assembly, Python, GDB, Ubuntu Linux, shellcode

Exploited stack buffer overflows in Set-UID root C programs to gain a root shell, then studied the defenses that stop the attack.
- Wrote exploit.py payloads that overflow the vulnerable buffer, inject shellcode, and overwrite the saved return address to spawn a root shell on both 32-bit and 64-bit binaries, across four buffer-size variants
- Handled the unknown-buffer-size case with a NOP sled and return-address spray, and reverse-engineered stack frame layout in GDB to compute exact return-address offsets
- Defeated countermeasures: bypassed dash's setuid(0) privilege drop by patching the shellcode, brute-forced past ASLR, and analyzed why StackGuard and a non-executable stack (NX) block the exploit

### LeopardWorks | TAMU Grade Lookup Discord Bot | github.com/eshaansaini2004/leopardworks

**Stack:** Python, discord.py, Playwright, Chromium, anex.us scraping, Rate My Professors scraping

Built a Discord bot for TAMU students that aggregates professor grade data, RMP ratings, and live section availability into a single command; adopted by 30–35 students for course planning and enrollment via integration with a companion Discord server.
- `/lookup` returns, for each course, professors ranked by historical avg GPA with full grade distribution (% A/B/C/D/F across all semesters on record), RMP rating, section times, locations, and open seat count — scraped from anex.us and Rate My Professors
- `/select` automates Howdy enrollment via headless Playwright: logs in with TAMU credentials, completes Duo MFA, and registers sections for specified professors across multiple courses
- `/reset` reverses section selections; bot supports up to 6 courses per command with data-quality warnings on profs with fewer than 3 semesters of history

### HEB Discord Bot | AWS Lambda Automation | github.com/eshaansaini2004/heb-discord-bot

**Stack:** Node.js 20, AWS Lambda, Playwright, @sparticuz/chromium, AWS Secrets Manager, Discord slash commands

Built a Discord bot that adds groceries to an H-E-B curbside cart via slash commands, deployed serverlessly on AWS Lambda with a headless Chromium browser.
- `/shop <items>` drives a full browser session (Playwright + @sparticuz/chromium) to search and cart items on HEB.com; handles Discord's 3-second deadline via async Lambda self-invocation with followup webhook delivery
- OTP-based auth flow: `/login` + `/otp` complete H-E-B authentication; session cookies persisted to AWS Secrets Manager between invocations so users authenticate once
- `/setstore` dropdown lets users switch between pre-configured H-E-B locations; Lambda IAM role scoped to Secrets Manager and self-invoke only

### Stackbox | CSCE 482 Senior Capstone | github.com/michtra/stackbox (private)

**Stack:** Next.js 16, React 19, Tailwind CSS v4, Mapbox GL, FastAPI, SQLAlchemy 2, PostgreSQL, AWS Cognito, AWS S3, trimesh, Pydantic v2, Docker

Building a commercial real estate intelligence platform for visualizing stacking plans — floor-by-floor tenant occupancy layouts for commercial buildings.
- Designed and implemented 25+ REST endpoints (FastAPI) for full CRUD on buildings, tenants, floors, occupancies, and file uploads; enforced with Pydantic v2 schemas and SQLAlchemy ORM
- Built an STL mesh ingestion pipeline using trimesh to horizontally slice 3D building models into floor polygons, stored as GeoJSON per RFC 7946
- Developed an Excel rent roll parser (openpyxl) that maps lease data (tenant, suite, sqft, base rent, lease start/end, lease type) to a structured StackingPlan JSON consumed by the frontend
- Rendered 3D interactive building visualizations using Mapbox GL fill-extrusion layers; each floor is split into per-tenant pie slices via radial line-polygon intersection algorithms
- Implemented AWS Cognito JWT validation (JWKS-based, with lru_cache for key fetching) as the auth middleware across all protected endpoints
- Built occupancy analytics charts (pie + per-floor bar) with PNG export via html2canvas; surfaces WALT, vacancy rates, and per-SF rent metrics
- Architected with Docker Compose for local dev; AWS RDS (PostgreSQL, sslmode=verify-full) + S3 presigned URL flow for production file storage

### PhishShield | Chrome Extension | github.com/eshaansaini2004/phish-shield-ext

**Stack:** JavaScript, React, Vite, scikit-learn (Python for training), Cloudflare Workers, Chrome Extension Manifest V3

Built a Chrome extension that detects phishing links in real time using four analysis layers:
- URL heuristics: 14 checks including IP-based URLs, brand impersonation, Unicode lookalikes, suspicious TLDs, and redirect chains
- In-browser ML classifier: MLP neural network (18 inputs → 32 → 16 → 1) trained with scikit-learn, exported to a 24 KB JSON weight file; runs entirely in the browser with no server round-trip, blended 45/55 with heuristic score
- DOM/page analysis: detects password fields on HTTP, cross-domain form submissions, hidden iframes, fake alert dialogs, and right-click disabling
- Download interception: flags high-risk file types, MIME mismatches, double extensions, and auto-downloads
- Integrated Google Safe Browsing API and PhishTank API via a Cloudflare Workers serverless backend
- Configurable settings page with per-layer toggles and domain whitelist synced via chrome.storage.sync

### Tab Tamer | Chrome Extension | github.com/eshaansaini2004/Tab-Tamer

**Stack:** JavaScript, React, Vite, Notion API, Chrome Extension Manifest V3, Webpack

Built an AI-powered tab organizer that categorizes open browser tabs into a 3-level hierarchy (category → sub-category → tabs) using domain-based priority matching across 7 categories.
- Notion integration: auto-creates a session database and saves organized sessions as structured pages with metadata and clickable links
- Settings page with Notion token config, connection test, and domain whitelist management
- Popup UI with collapsible sections and smooth animations

### Code Cartographer | HackTX 2025 | github.com/eshaansaini2004/Code-Cartographer

**Stack:** Python, Flask, Flask-SocketIO, Google Gemini 2.5 API, NetworkX, Plotly, tree-sitter, TypeScript (VS Code extension)

Built an AI-powered codebase analysis tool at HackTX 2025; extended into Study Pilot with a VS Code extension.
- Real-time WebSocket dashboard with batch processing for 50+ files
- Interactive dependency graphs with Plotly/NetworkX identifying hub files, circular dependencies, and orphaned code
- Project-scoped AI chatbot (Google Gemini) that only answers questions about the analyzed codebase
- VS Code extension (TypeScript) with right-click file analysis, workspace-wide batch analysis, and dashboard integration

### ShareTea POS | Full-Stack | github.com/eshaansaini2004/ShareTea-POS · github.com/michtra/project3-team21-team-method

**Stack:** React, Material UI, Node.js, Express, PostgreSQL, Google OAuth, OpenWeatherMap API, AWS RDS, Nginx, pm2

Led a 5-member team to build a full-stack point-of-sale system for a tea shop in under 4 weeks using Git/Agile.
- AWS-hosted PostgreSQL database with 90,000+ entries; 21 menu items with dynamic pricing based on popularity
- Role-based access: cashier view for order processing, manager dashboard for inventory and analytics
- Industry-standard reporting: X-Reports, Z-Reports, sales-by-item, and inventory usage reports
- Google OAuth for secure authentication; weather API integration for location-based menu recommendations
- Self-hosted production deployment on a VPS using Nginx as reverse proxy, SSL via certbot, and pm2

### Aho-Corasick Algorithm | C++ | github.com/eshaansaini2004/Aho-Corasick-Algorithm

**Stack:** C++

Implemented the Aho-Corasick multi-pattern string matching algorithm from scratch in C++ for keyword detection in text files. Later productionized and integrated into Vector Edge's classification SDK.

### BITBOT Computer | Hardware Design | github.com/eshaansaini2004/Computer-Architecture-Project

**Stack:** Scilab/HDL

Designed and integrated HDL components (CPU, Data Memory, Instruction ROM) for a custom 16-bit BITBOT computer platform capable of executing a proprietary instruction set architecture.

### Fashion-MNIST Image Classifier | ML | github.com/eshaansaini2004/Image-Classifier

**Stack:** Python, PyTorch

Built a CNN in Python with PyTorch to classify Fashion-MNIST images, achieving 91% test accuracy. Tuned architecture depth, dropout, and batch normalization.

### ThroughTheCookBook | E-Commerce | github.com/eshaansaini2004/throughthecookbook1

**Stack:** React, Tailwind CSS, Vercel

Co-founded a baking business and built its e-commerce platform from scratch with React and Tailwind CSS, deployed on Vercel with real-time order processing.

### Prompt Injection Firewall | github.com/eshaansaini2004/prompt-injection-firewall

**Stack:** Python, FastAPI, Next.js, SQLAlchemy (async), aiosqlite, sentence-transformers, Pydantic v2, WebSocket, Typer, Uvicorn

Built a drop-in OpenAI-compatible reverse proxy that detects and blocks prompt injection attacks before they reach the model — one `base_url` change integrates it into any existing codebase.
- Measured detection quality on a held-out split (69 attack / 109 benign): F1 0.924, precision 0.968, recall 0.884, ROC-AUC 0.982, with zero false positives from the heuristic layer on the benign corpus
- Two-layer detection engine: fast heuristic pass (regex + structural signals) runs in ~0.5ms; semantic layer (cosine similarity via `all-MiniLM-L6-v2` embeddings against a labeled corpus) only fires when heuristics are inconclusive
- Labeled corpus of 893 prompts (346 attack / 547 benign) across 14 attack categories from the OWASP LLM Top 10 and academic research (Perez & Ribeiro 2022, Greshake et al. 2023): direct injection, prompt leaking, jailbreaks, obfuscation (base64, unicode, ROT13), many-shot priming, RAG poisoning, and more
- Decision threshold tuned by a documented precision/recall sweep (default moved 0.50 → 0.40 as the benign corpus grew past 500 prompts); `python -m pif.eval` reproduces the numbers and CI fails on any F1 regression against the saved baseline
- Real-time Next.js dashboard showing blocked requests, attack type breakdown, and live event feed over WebSocket
- REST API for aggregate stats, paginated event log, hourly timeline buckets, and per-category blocked counts; `X-Firewall-Mode: monitor` header for passive logging without blocking
- 216 tests across all attack categories with false-positive checks; semantic layer mocked for fast CI

### CoC Discord Bot | github.com/eshaansaini2004/coc-discord-bot

**Stack:** Python, discord.py, coc.py (Clash of Clans API), aiosqlite, APScheduler

Built a cog-based Discord bot for a Clash of Clans clan that automates war defense tracking and Clan War League role assignment.
- Defense tracker logs and surfaces missed defenses during war, querying the CoC API and persisting results via aiosqlite
- CWL cog auto-assigns Discord roles based on league tier and participation, with scheduled APScheduler jobs for syncing clan data

### Clash of Clans Dashboard | github.com/eshaansaini2004/ClashOfClansDashboard

**Stack:** JavaScript, Clash of Clans API

Frontend dashboard visualizing Legend League statistics for Clash of Clans players, consuming the public game API.

---

## Extracurriculars

- **Gurdwara Volunteer Co-Lead:** Coordinated a team of 10 volunteers to prepare and serve monthly meals at a local Gurdwara, fostering community and serving 100+ people each event.
- **ThroughTheCookBook Co-Founder:** Co-launched a small baking business and built its e-commerce platform using React, Vercel, and Tailwind CSS to manage real-time order processing.
