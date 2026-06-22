import Foundation

/// Phases of flight the detector distinguishes. Each maps to a checklist.
///
/// NOTE: phase detection is a heuristic derived from GPS/ADS-B telemetry. It is
/// an advisory aid only and is not a substitute for the aircraft's POH checklist
/// or the pilot's judgment.
public enum FlightPhase: String, Codable, CaseIterable, Sendable {
    case preflight     // on ground, stationary, before first taxi
    case taxiOut       // moving on the ground before takeoff
    case takeoff       // takeoff roll
    case afterTakeoff  // just airborne, low, climbing (the "after takeoff" checklist)
    case climb         // established climb
    case cruise        // level, en route
    case descent       // en-route descent
    case approach      // descending in the terminal area / final
    case landing       // touchdown and rollout
    case taxiIn        // moving on the ground after landing
    case shutdown      // stopped after the flight

    public var displayName: String {
        switch self {
        case .preflight: return "Preflight"
        case .taxiOut: return "Taxi"
        case .takeoff: return "Takeoff"
        case .afterTakeoff: return "After Takeoff"
        case .climb: return "Climb"
        case .cruise: return "Cruise"
        case .descent: return "Descent"
        case .approach: return "Approach"
        case .landing: return "Landing"
        case .taxiIn: return "Taxi In"
        case .shutdown: return "Shutdown"
        }
    }
}
