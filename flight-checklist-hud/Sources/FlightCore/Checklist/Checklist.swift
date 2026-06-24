import Foundation

/// A single checklist line in challenge–response form, e.g.
/// challenge "Fuel selector" → response "BOTH".
public struct ChecklistItem: Codable, Equatable, Identifiable {
    public var id: String
    public var challenge: String
    public var response: String
    public var isChecked: Bool

    public init(id: String = UUID().uuidString,
                challenge: String,
                response: String,
                isChecked: Bool = false) {
        self.id = id
        self.challenge = challenge
        self.response = response
        self.isChecked = isChecked
    }

    private enum CodingKeys: String, CodingKey { case id, challenge, response, isChecked }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        challenge = try c.decode(String.self, forKey: .challenge)
        response = try c.decode(String.self, forKey: .response)
        isChecked = try c.decodeIfPresent(Bool.self, forKey: .isChecked) ?? false
    }
}

/// One named checklist from the card (e.g. "Before Start", "Climb").
///
/// `autoPhases` lists the detected `FlightPhase`s that should auto-switch the HUD
/// to this segment. Ground segments that telemetry cannot distinguish (engine
/// start, after start, run up) have an empty `autoPhases` and are reached only by
/// manual Neural Band tap-through.
public struct ChecklistSegment: Codable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var autoPhases: [FlightPhase]
    /// Free-text guidance shown beneath the items (e.g. the boxed "FINAL ITEMS…").
    public var notes: [String]
    public var items: [ChecklistItem]

    public init(id: String,
                title: String,
                autoPhases: [FlightPhase] = [],
                notes: [String] = [],
                items: [ChecklistItem]) {
        self.id = id
        self.title = title
        self.autoPhases = autoPhases
        self.notes = notes
        self.items = items
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, autoPhases, notes, items
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        autoPhases = try c.decodeIfPresent([FlightPhase].self, forKey: .autoPhases) ?? []
        notes = try c.decodeIfPresent([String].self, forKey: .notes) ?? []
        items = try c.decode([ChecklistItem].self, forKey: .items)
    }
}
