import Foundation

/// A single checklist line in challenge–response form, e.g.
/// challenge "Landing gear" → response "UP".
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
}

/// The checklist associated with one phase of flight.
public struct Checklist: Codable, Equatable {
    public var phase: FlightPhase
    public var title: String
    public var items: [ChecklistItem]

    public init(phase: FlightPhase, title: String, items: [ChecklistItem]) {
        self.phase = phase
        self.title = title
        self.items = items
    }
}
