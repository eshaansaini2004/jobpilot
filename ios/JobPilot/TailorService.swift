import Foundation
import WebKit

enum TailorError: Error, CustomStringConvertible {
    case badURL
    case http(Int, String)
    case noTex
    case jd(String)
    var description: String {
        switch self {
        case .badURL: return "bad worker URL"
        case let .http(code, body):
            if code == 501 { return "worker LLM key not set (owner-gated): \(body)" }
            return "worker \(code): \(body)"
        case .noTex: return "worker returned no tex"
        case let .jd(m): return "couldn't read job description: \(m)"
        }
    }
}

// Talks to the Worker's /generate. BYO-key: the app holds only a Worker URL, the
// LLM credential lives as a Worker secret. Also does a generic JD scrape; A5
// swaps in per-ATS selectors, this is the fallback.
@MainActor
final class TailorService: NSObject, WKNavigationDelegate {
    static var workerBase: String {
        UserDefaults.standard.string(forKey: "worker_base") ?? "https://jobpilot.esshaan.workers.dev"
    }

    private var webView: WKWebView?
    private var loadCont: CheckedContinuation<Void, Error>?

    // Load the posting offscreen and read its visible text plus the page <title>
    // (used to derive a real company/role, see parseListing).
    func fetchJD(_ urlString: String) async throws -> (jd: String, pageTitle: String) {
        guard let url = URL(string: urlString) else { throw TailorError.jd("bad url") }
        let wv = WKWebView(frame: .init(x: 0, y: 0, width: 1, height: 1))
        wv.navigationDelegate = self
        webView = wv
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            loadCont = c
            wv.load(URLRequest(url: url))
        }
        // give SPA content a beat to render, then grab innerText
        try? await Task.sleep(nanoseconds: 800_000_000)
        let text = try await wv.evaluateJavaScript("document.body.innerText") as? String
        let pageTitle = (try? await wv.evaluateJavaScript("document.title") as? String) ?? nil
        webView = nil
        guard let text, text.count > 40 else { throw TailorError.jd("page had no readable text") }
        return (text, pageTitle ?? "")
    }

    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { loadCont?.resume(); loadCont = nil }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) {
        loadCont?.resume(throwing: TailorError.jd(e.localizedDescription)); loadCont = nil
    }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        loadCont?.resume(throwing: TailorError.jd(e.localizedDescription)); loadCont = nil
    }

    // POST the JD to the Worker, get back the tailored .tex.
    func tailor(jd: String) async throws -> String {
        guard let url = URL(string: "\(Self.workerBase)/generate") else { throw TailorError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // The pipeline can run two LLM calls (draft + corrective pass), which
        // exceeds URLSession's 60s default. Give it room.
        req.timeoutInterval = 150
        req.httpBody = try JSONSerialization.data(withJSONObject: ["jd": jd])
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            throw TailorError.http(code, String(data: data, encoding: .utf8) ?? "")
        }
        struct R: Decodable { let tex: String }
        guard let r = try? JSONDecoder().decode(R.self, from: data), !r.tex.isEmpty else {
            throw TailorError.noTex
        }
        return r.tex
    }
}
