import Foundation

// Compile+run:  swiftc JobPilot/TitleParse.swift TitleParseTests.swift -o /tmp/tp && /tmp/tp
// Pure function check for parseListing — no network, no app target.

func check(_ pageTitle: String, host: String, company: String, title: String) {
    let got = parseListing(pageTitle: pageTitle, host: host)
    assert(got.company == company && got.title == title,
        "parseListing(\"\(pageTitle)\") = (\(got.company), \(got.title)), expected (\(company), \(title))")
    print("ok: \"\(pageTitle)\" -> company=\"\(got.company)\" title=\"\(got.title)\"")
}

@main enum Tests {
    static func main() {
        let host = "job-boards.greenhouse.io"
        check("Backend Engineer at Stripe", host: host, company: "Stripe", title: "Backend Engineer")
        check("Job Application for Backend Engineer at Stripe", host: host, company: "Stripe", title: "Backend Engineer")
        check("Stripe - Software Engineer, New Grad", host: host, company: "Stripe", title: "Software Engineer, New Grad")
        check("Software Engineer, New Grad - Netflix", host: host, company: "Netflix", title: "Software Engineer, New Grad")
        check("Netflix | Senior iOS Engineer", host: host, company: "Netflix", title: "Senior iOS Engineer")
        check("Careers | Ashby", host: host, company: host, title: host)
        check("", host: host, company: host, title: host)
        print("all title-parse tests passed")
    }
}
