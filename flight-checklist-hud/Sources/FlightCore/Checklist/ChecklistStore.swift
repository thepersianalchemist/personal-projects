import Foundation

/// Loads the ordered list of checklist segments from JSON so the card can be
/// edited per aircraft without recompiling. JSON shape: a top-level array of
/// `ChecklistSegment`, in the order they appear on the card.
public struct ChecklistStore {
    public let segments: [ChecklistSegment]
    private let phaseToSegmentIndex: [FlightPhase: Int]

    public init(segments: [ChecklistSegment]) {
        self.segments = segments
        var map: [FlightPhase: Int] = [:]
        for (i, seg) in segments.enumerated() {
            for phase in seg.autoPhases where map[phase] == nil {
                map[phase] = i
            }
        }
        phaseToSegmentIndex = map
    }

    public init(data: Data) throws {
        self.init(segments: try JSONDecoder().decode([ChecklistSegment].self, from: data))
    }

    public init(contentsOf url: URL) throws {
        try self.init(data: Data(contentsOf: url))
    }

    /// Loads the bundled Cessna 172P checklist shipped with the package.
    public static func bundled() throws -> ChecklistStore {
        guard let url = Bundle.module.url(forResource: "checklists", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try ChecklistStore(contentsOf: url)
    }

    /// The segment index a detected phase should switch to, if any.
    public func segmentIndex(for phase: FlightPhase) -> Int? {
        phaseToSegmentIndex[phase]
    }
}
