import Foundation

// Copies the bundled master resume into Documents on first launch.
// NOTE: currently vestigial. Tailoring runs in the Worker (which holds its own
// bundled master resume), so the app doesn't consume this yet. Kept because A4
// asks for it and A5's on-device flows may read it. One file, copied once.
enum Seed {
    static func runOnce() {
        let key = "seeded_master_v1"
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: key) else { return }
        if let src = Bundle.main.url(forResource: "master_resume", withExtension: "md") {
            let dst = appDocsDir().appendingPathComponent("master_resume.md")
            try? FileManager.default.removeItem(at: dst)
            try? FileManager.default.copyItem(at: src, to: dst)
        }
        defaults.set(true, forKey: key)
    }
}
