import XCTest
@testable import FlightCore

final class FlightSessionTests: XCTestCase {

    /// Builds a 28-byte GDL90 ownship message with the given dynamics, encoded
    /// the same way the decoder reads it.
    private func ownship(altFt: Int, gsKt: Int, vsFpm: Int,
                         lat: Double = 45, lon: Double = -90, trackDeg: Double = 90) -> [UInt8] {
        var m = [UInt8](repeating: 0, count: 28)
        m[0] = 0x0A

        func enc24(_ deg: Double) -> (UInt8, UInt8, UInt8) {
            let raw = Int((deg / (180.0 / Double(1 << 23))).rounded())
            let v = raw < 0 ? raw + (1 << 24) : raw
            return (UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF))
        }
        (m[5], m[6], m[7]) = enc24(lat)
        (m[8], m[9], m[10]) = enc24(lon)

        let altRaw = (altFt + 1000) / 25
        m[11] = UInt8((altRaw >> 4) & 0xFF)
        m[12] = UInt8((altRaw & 0xF) << 4)

        let hv = gsKt & 0xFFF
        let vv = (vsFpm / 64) & 0xFFF
        m[14] = UInt8((hv >> 4) & 0xFF)
        m[15] = UInt8(((hv & 0xF) << 4) | ((vv >> 8) & 0xF))
        m[16] = UInt8(vv & 0xFF)
        m[17] = UInt8(Int((trackDeg / (360.0 / 256.0)).rounded()) & 0xFF)
        m[18] = 0x01
        return m
    }

    func testDatagramsDriveChecklistToClimb() throws {
        var t: TimeInterval = 0
        let session = FlightSession(store: try ChecklistStore.bundled(), clock: { t })

        var phases: [FlightPhase] = []
        session.onPhaseChange = { phases.append($0) }

        func feed(seconds: Int, _ message: [UInt8]) {
            let frame = GDL90Framing.frame(message)
            for _ in 0..<seconds { session.ingest(datagram: frame); t += 1 }
        }

        // On the ground (zeroes field elevation), then airborne and climbing.
        feed(seconds: 6, ownship(altFt: 500, gsKt: 0, vsFpm: 0))
        XCTAssertEqual(session.displayState.segmentId, "before_start")

        feed(seconds: 8, ownship(altFt: 900, gsKt: 70, vsFpm: 800))
        XCTAssertTrue(phases.contains(.afterTakeoff), "should detect after-takeoff")
        XCTAssertEqual(session.displayState.segmentId, "climb",
                       "after-takeoff telemetry auto-switches the HUD to the Climb checklist")
    }

    func testCorruptDatagramIsIgnored() throws {
        let session = FlightSession(store: try ChecklistStore.bundled(), clock: { 0 })
        session.ingest(datagram: [0x7E, 0x0A, 0x01, 0x02, 0x7E]) // bad CRC garbage
        XCTAssertEqual(session.displayState.segmentId, "before_start")
    }

    func testFormatterWindowsAroundFocus() {
        let store = ChecklistStore(segments: [
            ChecklistSegment(id: "s", title: "Run Up", items: (1...10).map {
                ChecklistItem(id: "\($0)", challenge: "Item \($0)", response: "DO")
            })
        ])
        let c = ChecklistController(store: store)
        c.advance(); c.advance(); c.advance()   // focus now on item index 3

        let lines = DisplayFormatter.itemLines(c.state, window: 5)
        XCTAssertEqual(lines.count, 5)
        XCTAssertEqual(lines.filter { $0.hasPrefix("›") }.count, 1, "exactly one focus marker")
        XCTAssertTrue(DisplayFormatter.header(c.state).hasPrefix("RUN UP"))
    }
}
