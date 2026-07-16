import Foundation
import WebKit

// Compiles LaTeX to PDF on-device via busytex (WASM) running inside an offscreen
// WKWebView. Assets live in the app bundle under busytex/ and are served to the
// web content through a custom URL scheme (needed so the page can spawn a Worker
// and stream the .wasm from a real origin — file:// can't).
@MainActor
final class LatexEngine: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    // One shared engine, warmed at launch (see warmUp). WebKit disk-caches the
    // compiled 29MB WASM after the first compile; a fresh engine per tailor threw
    // that cache away. Compiles are serialized (see `tail`) so the single-slot
    // continuations below can never overlap.
    static let shared = LatexEngine()

    enum EngineError: Error, CustomStringConvertible {
        case timeout, compile(String)
        var description: String {
            switch self {
            case .timeout: return "on-device PDF renderer timed out"
            case let .compile(m): return "LaTeX compile failed: \(m)"
            }
        }
    }

    private var webView: WKWebView!
    private var readyContinuation: CheckedContinuation<Void, Error>?
    private var isReady = false
    private var compileContinuation: CheckedContinuation<Data, Error>?
    private var tail: Task<Data, Error>?   // serial chain: one compile at a time

    override init() {
        super.init()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "busytex")
        config.userContentController.add(self, name: "busytex")
        webView = WKWebView(frame: .init(x: 0, y: 0, width: 1, height: 1), configuration: config)
        webView.navigationDelegate = self
    }

    // Load latex.html over the custom scheme so its relative fetches + Worker resolve there.
    private func loadPage() {
        let url = URL(string: "busytex://app/latex.html")!
        webView.load(URLRequest(url: url))
    }

    // Wait until the page signals {ready:true}. Throws if the page fails to load or
    // never signals ready within the window (cold WASM compile can run ~45s, so the
    // watchdog is generous). isReady stays false on failure, so a retry reloads.
    private func waitUntilReady() async throws {
        if isReady { return }
        let watchdog = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            guard let self, !self.isReady else { return }
            self.readyContinuation?.resume(throwing: EngineError.timeout)
            self.readyContinuation = nil
        }
        defer { watchdog.cancel() }
        try await withCheckedThrowingContinuation { cont in
            readyContinuation = cont
            loadPage()
        }
    }

    /// Compile a .tex string to PDF bytes. Throws on a LaTeX error. Serialized: a
    /// second caller (e.g. a Tailor tap landing mid-warmup) waits its turn instead
    /// of clobbering the in-flight compile's continuation.
    func compile(tex: String) async throws -> Data {
        let prev = tail
        let task = Task { () throws -> Data in
            _ = try? await prev?.value     // let the previous compile finish first
            return try await self._compile(tex: tex)
        }
        tail = task
        return try await task.value
    }

    private func _compile(tex: String) async throws -> Data {
        try await waitUntilReady()
        let arg = String(data: try JSONEncoder().encode(tex), encoding: .utf8)!  // safe JS string literal
        let watchdog = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 120_000_000_000)
            self?.finishCompile(.failure(EngineError.timeout))
        }
        defer { watchdog.cancel() }
        return try await withCheckedThrowingContinuation { cont in
            compileContinuation = cont
            // compileResume is async (returns a Promise, which evaluateJavaScript can't
            // serialize); the result comes back via the message handler. `void 0` keeps
            // the eval return type valid. Only a real invocation failure fails here.
            webView.evaluateJavaScript("window.compileResume(\(arg)); void 0;") { _, err in
                if let err = err as NSError?, err.code != WKError.javaScriptResultTypeIsUnsupported.rawValue {
                    self.finishCompile(.failure(err))
                }
            }
        }
    }

    // Warm the WASM cache once at launch so the user's first Tailor compiles warm
    // (~2s) instead of cold (~45s). Non-blocking: call from a detached launch Task.
    // Uses the bundled resume.tex (known-good) as the throwaway document.
    static func warmUp() async {
        guard let url = Bundle.main.url(forResource: "busytex/resume", withExtension: "tex"),
              let tex = try? String(contentsOf: url, encoding: .utf8) else {
            NSLog("JOBPILOT warmup skipped: resume.tex not found")
            return
        }
        let t0 = Date()
        do {
            _ = try await shared.compile(tex: tex)
            NSLog("JOBPILOT warmup compile done in %.0fms", Date().timeIntervalSince(t0) * 1000)
        } catch {
            NSLog("JOBPILOT warmup failed: %@", String(describing: error))
        }
    }

    private func finishCompile(_ result: Result<Data, Error>) {
        guard let cont = compileContinuation else { return }
        compileContinuation = nil
        cont.resume(with: result)
    }

    // Page (not a compile) failed to load -> unblock any waiter so it can retry.
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { failReady(e) }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { failReady(e) }
    private func failReady(_ e: Error) {
        guard !isReady else { return }
        readyContinuation?.resume(throwing: EngineError.compile("renderer page failed to load: \(e.localizedDescription)"))
        readyContinuation = nil
    }

    // MARK: messages from latex.html
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if body["ready"] != nil {
            isReady = true
            readyContinuation?.resume(returning: ()); readyContinuation = nil
            return
        }
        if let b64 = body["pdf"] as? String, let data = Data(base64Encoded: b64) {
            if let ms = body["ms"] as? Int { NSLog("busytex compile %dms, %d bytes", ms, data.count) }
            finishCompile(.success(data))
        } else if let err = body["error"] as? String {
            let log = (body["log"] as? String).map { "\n" + $0 } ?? ""
            finishCompile(.failure(EngineError.compile(err + log)))
        }
    }
}

// Serves busytex://app/<path> from the app bundle's busytex/ folder.
private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url,
              case let path = String(url.path.drop(while: { $0 == "/" })), !path.isEmpty,
              let fileURL = Bundle.main.url(forResource: "busytex/\(path)", withExtension: nil),
              let data = try? Data(contentsOf: fileURL) else {
            task.didFailWithError(NSError(domain: "busytex", code: 404))
            return
        }
        let mime: String
        switch (url.pathExtension) {
        case "wasm": mime = "application/wasm"
        case "js":   mime = "text/javascript"
        case "html": mime = "text/html"
        case "json": mime = "application/json"
        default:     mime = "application/octet-stream"
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
