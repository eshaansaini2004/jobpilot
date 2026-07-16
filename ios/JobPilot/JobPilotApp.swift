import SwiftUI
import SwiftData

@main
struct JobPilotApp: App {
    @State private var openedURL: String?

    var body: some Scene {
        WindowGroup {
            RootView(openedURL: $openedURL)
                .onOpenURL { url in
                    // Deep link: jobpilot://job?url=<posting url>
                    let target = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "url" })?.value
                    openedURL = target
                    NSLog("JOBPILOT openURL job=%@", target ?? "nil")
                    writeProof(target ?? "nil")
                }
                .task { Seed.runOnce() }
                // Warm the LaTeX WASM cache in the background so the first Tailor is fast.
                .task { await LatexEngine.warmUp() }
        }
        .modelContainer(for: Job.self)
    }
}

// Headless proof for the W0.5 deep-link test. Not part of the shipping UI.
func writeProof(_ s: String) {
    let dst = appDocsDir().appendingPathComponent("received.txt")
    try? (s + "\n").data(using: .utf8)!.write(to: dst)
}
