import SwiftUI
import SwiftData
import PDFKit

// Root. No feed (Discord is the feed), just the jobs opened via deep link, most
// recent first. A jobpilot://job?url= link upserts a Job and pushes its detail.
struct RootView: View {
    @Binding var openedURL: String?
    @Environment(\.modelContext) private var ctx
    @Query(sort: \Job.createdAt, order: .reverse) private var jobs: [Job]
    @State private var path: [Job] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if jobs.isEmpty {
                    ContentUnavailableView(
                        "No jobs yet",
                        systemImage: "tray",
                        description: Text("Tap \u{201C}Tailor this\u{201D} on a JobPilot Discord card to open a posting here.")
                    )
                } else {
                    List(jobs) { job in
                        NavigationLink(value: job) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(job.company).bold()
                                Text(job.title).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                }
            }
            .navigationTitle("JobPilot")
            .navigationDestination(for: Job.self) { JobDetailView(job: $0) }
        }
        .onChange(of: openedURL) { _, url in
            guard let url, !url.isEmpty else { return }
            path = [upsert(url)]
            openedURL = nil
        }
    }

    // Re-tapping the same Discord card returns the existing job (with its saved
    // PDF), not a fresh one. That's the A4 exit condition.
    private func upsert(_ url: String) -> Job {
        var d = FetchDescriptor<Job>(predicate: #Predicate { $0.url == url })
        d.fetchLimit = 1
        if let existing = try? ctx.fetch(d).first { return existing }
        let job = Job(url: url)
        ctx.insert(job)
        return job
    }
}

struct JobDetailView: View {
    @Bindable var job: Job
    @State private var service = TailorService()
    @State private var pdfDoc: PDFDocument?
    @State private var shareURL: URL?
    @State private var status = ""
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(job.company).font(.title2).bold().lineLimit(2)
                // Role only shows once tailoring has filled it in; until then it just
                // mirrors the host (Job defaults company==title==host), so skip it.
                if job.title != job.company {
                    Text(job.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                }
                if let u = URL(string: job.url) {
                    Link(destination: u) {
                        Label(u.host ?? job.url, systemImage: "link").font(.caption)
                    }.lineLimit(1)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)

            Button {
                tailor()
            } label: {
                Text(pdfDoc == nil ? "Tailor resume" : "Re-tailor")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(busy)

            if busy {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(status).font(.footnote).foregroundStyle(.secondary)
                }
            } else if failed, !status.isEmpty {
                Text(status).font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            } else if !status.isEmpty {
                Label(status, systemImage: "checkmark.circle.fill")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            if let pdfDoc {
                PDFKitView(document: pdfDoc)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(.gray.opacity(0.25)))
            }
            Spacer(minLength: 0)
        }
        .padding()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let shareURL {
                ShareLink(item: shareURL) { Image(systemName: "square.and.arrow.up") }
            }
        }
        .onAppear(perform: loadSavedPDF)
    }

    private func loadSavedPDF() {
        guard pdfDoc == nil, let name = job.pdfPath else { return }
        let url = appDocsDir().appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return }
        pdfDoc = PDFDocument(data: data)
        shareURL = makeShareCopy(from: url)
    }

    // Copy the saved PDF to a nicely-named temp file so the share sheet and the
    // resulting attachment read as "Resume_<Company>.pdf" instead of a UUID.
    private func makeShareCopy(from src: URL) -> URL? {
        let safe = job.company.components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }.joined(separator: "_")
        let name = safe.isEmpty ? "Resume.pdf" : "Resume_\(safe).pdf"
        let dst = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: dst)
        guard (try? FileManager.default.copyItem(at: src, to: dst)) != nil else { return src }
        return dst
    }

    // Full chain: scrape JD -> Worker /generate -> on-device LatexEngine -> PDF,
    // then an on-device compile-trim loop. The model can't see page count and its
    // drafts run ~1.2 pages, so we compile, and while it's over a page we drop the
    // single least-relevant trailing bullet and recompile (warm, ~1.5s). No extra
    // LLM call: the cut is deterministic and minimal, unlike asking the model to
    // trim (which over-cuts whole projects because it's guessing at length).
    private func tailor() {
        busy = true
        failed = false
        job.status = "tailoring"
        status = "Fetching job description\u{2026}"
        Task {
            do {
                let (jd, pageTitle) = try await service.fetchJD(job.url)
                // Replace the raw-host placeholder with a real company/role (persisted).
                let parsed = parseListing(pageTitle: pageTitle, host: Job.hostLabel(job.url))
                job.company = parsed.company
                job.title = parsed.title
                status = "Tailoring with your model\u{2026}"
                var tex = try await service.tailor(jd: jd)
                let engine = LatexEngine.shared  // warmed at launch; reused across passes
                status = "Rendering PDF on-device\u{2026}"
                var data = try await engine.compile(tex: tex)
                var pages = PDFDocument(data: data)?.pageCount ?? 1

                var cuts = 0
                while pages > 1, cuts < 12, let trimmed = trimLastBullet(tex) {
                    cuts += 1
                    tex = trimmed
                    status = "Fitting to one page (trim \(cuts))\u{2026}"
                    data = try await engine.compile(tex: tex)
                    pages = PDFDocument(data: data)?.pageCount ?? 1
                }

                let name = "resume_\(job.id.uuidString).pdf"
                let savedURL = appDocsDir().appendingPathComponent(name)
                try? data.write(to: savedURL)
                job.pdfPath = name
                job.status = "ready"
                pdfDoc = PDFDocument(data: data)
                shareURL = makeShareCopy(from: savedURL)
                status = pages > 1 ? "Ready, still \(pages) pages" : "Resume ready"
                NSLog("JOBPILOT tailor done: %d pages, %d trims, %d bytes", pages, cuts, data.count)
            } catch {
                job.status = "error"
                failed = true
                status = friendlyError(error)
                NSLog("JOBPILOT tailor error: %@", String(describing: error))
            }
            busy = false
        }
    }

    // Owner-facing failure copy. One sentence, tells them what to do; the Tailor
    // button below is the retry (busy is cleared above, so it's tappable again).
    private func friendlyError(_ error: Error) -> String {
        switch error {
        case let e as TailorError:
            switch e {
            case .badURL: return "Your worker URL looks wrong. Fix it, then tap to retry."
            case let .http(code, _) where code == 501:
                return "Your worker's LLM key isn't set. Set it as a worker secret, then retry."
            case .http: return "Your worker rejected the request. Check it's deployed, then retry."
            case .noTex: return "The worker didn't return a resume. Tap to retry."
            case .jd: return "Couldn't read this posting's text. Open the link to check it loads, then retry."
            }
        case is URLError:
            return "Can't reach your worker. Check you're online and it's running, then retry."
        case let e as LatexEngine.EngineError:
            switch e {
            case .timeout: return "On-device rendering timed out. Tap to retry."
            case .compile: return "The resume didn't compile. Tap to retry."
            }
        default:
            return "Something went wrong. Tap to retry."
        }
    }

    // Deterministic minimal one-page trim. Drops the last project bullet (least
    // relevant, since the draft orders projects + bullets by relevance). If that
    // project is down to a single bullet, drops the whole near-empty project block
    // instead. Returns nil when there's nothing left to cut. Assumes one \item per
    // source line, which the generated .tex holds to.
    private func trimLastBullet(_ tex: String) -> String? {
        var lines = tex.components(separatedBy: "\n")
        guard let pstart = lines.firstIndex(where: { $0.contains("\\section") && $0.contains("PROJECTS") }),
              let edoc = lines.firstIndex(where: { $0.contains("\\end{document}") }) else { return nil }
        let begins = (pstart..<edoc).filter { lines[$0].contains("\\begin{itemize}") }
        guard let lb = begins.last,
              let le = (lb..<edoc).first(where: { lines[$0].contains("\\end{itemize}") }) else { return nil }
        let items = (lb..<le).filter { lines[$0].contains("\\item") }
        if items.count >= 2 {
            lines.remove(at: items.last!)
        } else {
            guard let hdr = (pstart..<lb).reversed().first(where: { lines[$0].contains("\\textbf{") }) else { return nil }
            lines.removeSubrange(hdr...le)
        }
        return lines.joined(separator: "\n")
    }
}

// Minimal PDFKit wrapper (kept from the A2 proof view).
struct PDFKitView: UIViewRepresentable {
    let document: PDFDocument
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView(); v.autoScales = true; v.document = document; return v
    }
    func updateUIView(_ v: PDFView, context: Context) { v.document = document }
}
