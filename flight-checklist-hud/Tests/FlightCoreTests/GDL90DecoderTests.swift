import XCTest
@testable import FlightCore

final class GDL90DecoderTests: XCTestCase {

    /// Hand-built ownship report (message ID 0x0A). The expected values below are
    /// computed by hand from the GDL90 field encodings so this test validates the
    /// spec interpretation itself, not just round-trip symmetry.
    ///
    ///   lat  raw 0x200000 = +2^21 -> 0.25 * 180 = 45.0 deg
    ///   lon  raw 0xC00000 = -2^22 -> -0.5 * 180 = -90.0 deg
    ///   alt  raw 260      -> 260*25 - 1000 = 5500 ft
    ///   gs   raw 120      -> 120 kt
    ///   vs   raw 8        -> 8*64 = 512 fpm
    ///   trk  raw 64       -> 64 * 360/256 = 90.0 deg
    private let ownshipMessage: [UInt8] = [
        0x0A,                   // message ID
        0x00,                   // s/t
        0x00, 0x00, 0x00,       // address
        0x20, 0x00, 0x00,       // latitude  -> 45.0
        0xC0, 0x00, 0x00,       // longitude -> -90.0
        0x10, 0x40,             // altitude (260) + misc
        0x00,                   // NIC/NACp
        0x07, 0x80, 0x08,       // horiz vel 120 kt, vert vel +512 fpm
        0x40,                   // track 90 deg
        0x01,                   // emitter category
        0x4E, 0x31, 0x32, 0x33, 0x41, 0x42, 0x20, 0x20, // "N123AB  "
        0x00                    // code
    ]

    func testOwnshipFieldDecoding() throws {
        let report = try XCTUnwrap(OwnshipReport(message: ownshipMessage))
        XCTAssertEqual(report.latitudeDeg, 45.0, accuracy: 1e-6)
        XCTAssertEqual(report.longitudeDeg, -90.0, accuracy: 1e-6)
        XCTAssertEqual(report.pressureAltitudeFt, 5500)
        XCTAssertEqual(report.groundSpeedKt, 120)
        XCTAssertEqual(report.verticalSpeedFpm, 512)
        XCTAssertEqual(report.trackDeg, 90.0, accuracy: 1e-6)
        XCTAssertEqual(report.callSign, "N123AB")
    }

    func testInvalidSentinels() throws {
        var m = ownshipMessage
        m[11] = 0xFF; m[12] = 0xF0           // altitude 0xFFF -> invalid
        m[14] = 0xFF; m[15] = 0xF8           // horiz vel 0xFFF -> invalid; vert vel high nibble 8
        m[16] = 0x00                         // vert vel 0x800 -> no data
        let report = try XCTUnwrap(OwnshipReport(message: m))
        XCTAssertNil(report.pressureAltitudeFt)
        XCTAssertNil(report.groundSpeedKt)
        XCTAssertNil(report.verticalSpeedFpm)
    }

    func testNegativeVerticalSpeed() throws {
        var m = ownshipMessage
        // vvRaw = 0xFC0 = -64 (two's complement) -> -64 * 64 = -4096 fpm
        m[15] = (m[15] & 0xF0) | 0x0F        // vert vel high nibble = 0xF
        m[16] = 0xC0                          // low byte 0xC0  => 0xFC0
        let report = try XCTUnwrap(OwnshipReport(message: m))
        XCTAssertEqual(report.verticalSpeedFpm, -4096)
    }

    func testGeometricAltitudeDecoding() throws {
        // raw 500 * 5 = 2500 ft
        let msg: [UInt8] = [0x0B, 0x01, 0xF4, 0x00, 0x00]
        let geo = try XCTUnwrap(OwnshipGeometricAltitude(message: msg))
        XCTAssertEqual(geo.geometricAltitudeFt, 2500)
    }

    func testFramingRoundTripWithByteStuffing() {
        // Payload deliberately contains the flag (0x7E) and escape (0x7D) bytes.
        let message: [UInt8] = [0x0A, 0x7E, 0x7D, 0x12, 0x34]
        let framed = GDL90Framing.frame(message)
        XCTAssertEqual(framed.first, 0x7E)
        XCTAssertEqual(framed.last, 0x7E)

        let deframer = GDL90Deframer()
        let out = deframer.consume(framed)
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out.first, message)
    }

    func testOwnshipThroughFullPipeline() throws {
        let framed = GDL90Framing.frame(ownshipMessage)
        let deframer = GDL90Deframer()
        let messages = deframer.consume(framed)
        XCTAssertEqual(messages.count, 1)
        guard case let .ownship(report) = GDL90Decoded(message: messages[0]) else {
            return XCTFail("expected ownship report")
        }
        XCTAssertEqual(report.groundSpeedKt, 120)
        XCTAssertEqual(report.pressureAltitudeFt, 5500)
    }

    func testBadCRCIsDropped() {
        var framed = GDL90Framing.frame(ownshipMessage)
        // Corrupt a payload byte (index 5 is inside the frame, not a flag/escape).
        framed[5] ^= 0xFF
        let deframer = GDL90Deframer()
        XCTAssertTrue(deframer.consume(framed).isEmpty)
    }

    func testAssemblerPrefersGeometricAltitude() {
        let assembler = GDL90SampleAssembler(clock: { 1000 })
        // Geometric altitude arrives first and should override pressure altitude.
        _ = assembler.ingest(.geometricAltitude(
            OwnshipGeometricAltitude(message: [0x0B, 0x01, 0xF4, 0x00, 0x00])!))
        let report = OwnshipReport(message: ownshipMessage)!
        let sample = assembler.ingest(.ownship(report))
        XCTAssertEqual(sample?.altitudeFt, 2500)   // geometric, not the 5500 pressure
        XCTAssertEqual(sample?.groundSpeedKt, 120)
    }
}
