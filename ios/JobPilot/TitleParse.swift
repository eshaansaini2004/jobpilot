import Foundation

// Pull a real company + role out of a job posting's <title>. ATS titles come in a
// handful of shapes: "Role at Company" (Greenhouse, often "Job Application for Role
// at Company"), "Company - Role" (Lever), "Role - Company", "Company | Role". When
// the title is generic ("Careers | Ashby") we can't do better than the host.
//
// Pure Foundation, no network, no SwiftData — so it stays unit-testable (see
// ../TitleParseTests.swift).

// Tokens that are never a company or a role: ATS product names, boilerplate.
private let genericTokens: Set<String> = [
    "careers", "career", "jobs", "job", "job application", "home", "apply",
    "greenhouse", "lever", "ashby", "ashbyhq", "workday", "smartrecruiters",
    "icims", "taleo", "bamboohr", "we're hiring", "hiring",
]

// Words that mark a string as a role rather than a company name.
private let roleKeywords = [
    "engineer", "developer", "manager", "intern", "scientist", "analyst",
    "designer", "architect", "consultant", "specialist", "administrator",
    "lead", "researcher", "technician", "new grad", "swe",
]

private func isGeneric(_ s: String) -> Bool {
    genericTokens.contains(s.lowercased())
}

private func looksLikeRole(_ s: String) -> Bool {
    let low = s.lowercased()
    return roleKeywords.contains { low.contains($0) }
}

/// Best-effort (company, role) from a page title. Falls back to `host` for company
/// and role when the title carries no usable signal.
func parseListing(pageTitle rawTitle: String, host: String) -> (company: String, title: String) {
    var t = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    // Greenhouse boilerplate prefix.
    for prefix in ["Job Application for ", "Apply for ", "Apply to "] {
        if t.lowercased().hasPrefix(prefix.lowercased()) {
            t = String(t.dropFirst(prefix.count))
        }
    }

    // Strongest signal: "Role at Company".
    if let r = t.range(of: " at ", options: .caseInsensitive) {
        let role = String(t[..<r.lowerBound]).trimmingCharacters(in: .whitespaces)
        let company = String(t[r.upperBound...]).trimmingCharacters(in: .whitespaces)
        if !role.isEmpty, !company.isEmpty, !isGeneric(company) {
            return (company, role)
        }
    }

    // Two-sided separators: figure out which side is the role by keyword.
    for sep in [" | ", " – ", " — ", " - ", " · "] {
        guard let r = t.range(of: sep) else { continue }
        let left = String(t[..<r.lowerBound]).trimmingCharacters(in: .whitespaces)
        let right = String(t[r.upperBound...]).trimmingCharacters(in: .whitespaces)
        let sides = [left, right].filter { !$0.isEmpty && !isGeneric($0) }
        if sides.count < 2 { return (host, host) }  // boilerplate on a side -> give up

        if looksLikeRole(left), !looksLikeRole(right) { return (right, left) }
        if looksLikeRole(right), !looksLikeRole(left) { return (left, right) }
        // Neither or both look like a role: assume "Company - Role" (Lever's shape).
        return (left, right)
    }

    // No separator. A single clean token that reads as a role becomes the title.
    if !t.isEmpty, !isGeneric(t) {
        return looksLikeRole(t) ? (host, t) : (t, host)
    }

    return (host, host)
}
