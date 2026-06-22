import Foundation

/// Loads checklists from JSON so they can be edited per aircraft without
/// recompiling. JSON shape: a top-level array of `Checklist`.
public struct ChecklistStore {
    private var byPhase: [FlightPhase: Checklist]

    public init(checklists: [Checklist]) {
        byPhase = Dictionary(uniqueKeysWithValues: checklists.map { ($0.phase, $0) })
    }

    public init(data: Data) throws {
        let decoded = try JSONDecoder().decode([Checklist].self, from: data)
        self.init(checklists: decoded)
    }

    public init(contentsOf url: URL) throws {
        try self.init(data: Data(contentsOf: url))
    }

    /// Loads the bundled sample checklists shipped with the package.
    public static func bundledSamples() throws -> ChecklistStore {
        guard let url = Bundle.module.url(forResource: "checklists", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try ChecklistStore(contentsOf: url)
    }

    public func checklist(for phase: FlightPhase) -> Checklist? {
        byPhase[phase]
    }
}
