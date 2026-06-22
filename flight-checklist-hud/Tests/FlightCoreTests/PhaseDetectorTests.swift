import XCTest
@testable import FlightCore

final class PhaseDetectorTests: XCTestCase {

    /// Replays a synthetic full flight (field elevation 500 ft MSL) at 1 Hz and
    /// asserts the detector walks through every phase in order.
    func testFullSyntheticFlight() {
        let detector = PhaseDetector()
        var transitions: [FlightPhase] = []
        detector.onChange = { transitions.append($0) }

        var t: TimeInterval = 0
        func feed(seconds: Int, gs: Double, altMSL: Double, vs: Double) {
            for _ in 0..<seconds {
                detector.ingest(OwnshipSample(timestamp: t,
                                              altitudeFt: altMSL,
                                              groundSpeedKt: gs,
                                              verticalSpeedFpm: vs))
                t += 1
            }
        }

        feed(seconds: 6, gs: 0,   altMSL: 500,  vs: 0)     // preflight (zeroes field elev)
        feed(seconds: 6, gs: 10,  altMSL: 500,  vs: 0)     // taxiOut
        feed(seconds: 6, gs: 45,  altMSL: 500,  vs: 0)     // takeoff roll
        feed(seconds: 6, gs: 70,  altMSL: 900,  vs: 800)   // afterTakeoff (agl 400)
        feed(seconds: 6, gs: 90,  altMSL: 2000, vs: 800)   // climb (agl 1500)
        feed(seconds: 6, gs: 120, altMSL: 5500, vs: 0)     // cruise (agl 5000)
        feed(seconds: 6, gs: 120, altMSL: 4000, vs: -700)  // descent (agl 3500)
        feed(seconds: 6, gs: 80,  altMSL: 1000, vs: -500)  // approach (agl 500)
        feed(seconds: 6, gs: 40,  altMSL: 500,  vs: 0)     // landing rollout
        feed(seconds: 6, gs: 10,  altMSL: 500,  vs: 0)     // taxiIn
        feed(seconds: 6, gs: 0,   altMSL: 500,  vs: 0)     // shutdown

        XCTAssertEqual(transitions, [
            .taxiOut, .takeoff, .afterTakeoff, .climb,
            .cruise, .descent, .approach, .landing, .taxiIn, .shutdown
        ])
        XCTAssertEqual(detector.phase, .shutdown)
    }

    /// A brief GPS glitch shorter than minDwell must not flip the phase.
    func testHysteresisRejectsTransientGlitch() {
        let detector = PhaseDetector()
        var t: TimeInterval = 0
        func feed(seconds: Int, gs: Double) {
            for _ in 0..<seconds {
                detector.ingest(OwnshipSample(timestamp: t, altitudeFt: 500,
                                              groundSpeedKt: gs, verticalSpeedFpm: 0))
                t += 1
            }
        }
        feed(seconds: 6, gs: 10)   // settle into taxiOut
        XCTAssertEqual(detector.phase, .taxiOut)
        feed(seconds: 2, gs: 0)    // 2 s glitch (< minDwell of 4 s)
        XCTAssertEqual(detector.phase, .taxiOut, "transient should not change phase")
        feed(seconds: 6, gs: 10)
        XCTAssertEqual(detector.phase, .taxiOut)
    }
}
