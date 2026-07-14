import Foundation
import SwiftData

// One opened posting. Created when a jobpilot://job?url= deep link lands, tailored
// on demand. No feed, no watchlist — Discord is the feed.
@Model
final class Job {
    var id: UUID
    @Attribute(.unique) var url: String
    var title: String
    var company: String
    var status: String       // new | tailoring | ready | error
    var pdfPath: String?     // filename under Documents/, once rendered
    var createdAt: Date

    init(url: String) {
        self.id = UUID()
        self.url = url
        self.company = Job.hostLabel(url)
        self.title = url
        self.status = "new"
        self.createdAt = .now
    }

    // A5's JD scraper will fill in the real title/company; until then, the host
    // is a readable stand-in (jobs.lever.co -> "jobs.lever.co").
    static func hostLabel(_ url: String) -> String {
        URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") ?? "Job"
    }
}

func appDocsDir() -> URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
}
