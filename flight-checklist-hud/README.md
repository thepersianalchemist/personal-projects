# FlightCore

Phase-aware checklist engine for a Ray-Ban Display HUD. It listens to the same
**GDL90 / ADS-B** telemetry stream that ForeFlight consumes, infers the current
**phase of flight**, and surfaces the matching checklist on the glasses — so the
right checklist (e.g. *After Takeoff*) appears automatically.

> ⚠️ **Advisory only.** Phase detection is a heuristic derived from GPS/ADS-B
> data, which is not certified for navigation. This is a heads-up backup, **not a
> replacement** for the aircraft POH checklist or pilot judgment.

## Why not the ForeFlight API?

ForeFlight has no public API for *live* flight state — only the **Dispatch API**
(operator scheduling) and **CloudAhoy APIs** (post-flight analysis). So instead
of reading from ForeFlight, we tap the underlying data source: portable ADS-B
receivers (Sentry / Stratux / Stratus / Scout) broadcast **GDL90 over WiFi UDP**,
and ForeFlight is just one consumer. Our app listens to the same broadcast.

## Architecture

```
ADS-B receiver ──GDL90/UDP──▶ GDL90Deframer ──▶ GDL90Decoded
                                                     │
                                          GDL90SampleAssembler
                                                     │  OwnshipSample
                                                     ▼
                                              PhaseDetector ──FlightPhase──▶ ChecklistController
                                                                                   │ DisplayState
                                                                                   ▼
                                                                          Ray-Ban Display (UI layer)
```

This package is **pure Foundation** (no iOS dependencies) so the whole engine is
unit-testable on the ground without glasses or an aircraft.

### Modules (`Sources/FlightCore`)

| Area | Files | Responsibility |
|------|-------|----------------|
| GDL90 | `CRC16CCITT`, `GDL90Framing`, `GDL90Decoder` | De-frame UDP bytes, validate CRC, decode ownship position/velocity & geometric altitude |
| Phase | `OwnshipSample`, `GDL90SampleAssembler`, `FlightPhase`, `PhaseDetector` | Normalize fixes and run the phase state machine (with hysteresis + AGL auto-zero) |
| Checklist | `Checklist` (segment model), `ChecklistStore`, `ChecklistController` | Ordered named checklists; auto-switch by phase or manual tap-through; expose a `DisplayState`; handle gestures |
| Session | `FlightSession`, `GlassesRenderer`/`DisplayFormatter`, `SentryUDPListener` | Wire the pipeline end-to-end; format the HUD; receive Sentry's UDP broadcast |

Checklists live in `Sources/FlightCore/Resources/checklists.json` — currently the
real **Project A.C.E.S. Cessna 172P (AV-30-C / GPSMAP 696)** normal checklist,
transcribed from the card. Edit this file to match your own aircraft's POH.

### Auto vs. manual segments

The card has 11 named checklists, but several ground flows — **Engine Start**,
**After Start**, **Run Up** — happen at a standstill and are indistinguishable
from telemetry. So the model is **hybrid**:

- Each `ChecklistSegment` lists the `FlightPhase`s that auto-switch to it
  (`autoPhases`). Auto-switching is **forward-only** so a momentary stop never
  drags the HUD backward.
- Ground-only segments have empty `autoPhases` and are reached by **Neural Band
  tap-through** (`nextSegment()` / `prevSegment()`).

| Segment | Trigger |
|---------|---------|
| Before Start | auto: `preflight` |
| Engine Start, After Start, Run Up | manual tap |
| Before Taxi | auto: `taxiOut` |
| Before Takeoff | auto: `takeoff` |
| Climb | auto: `afterTakeoff`, `climb` |
| Cruise / Pre-Maneuver | auto: `cruise` |
| In Range / Descent / Landing | auto: `descent`, `approach`, `landing` |
| After Landing | auto: `taxiIn` |
| Shutdown | auto: `shutdown` |

## Running the tests

```bash
cd flight-checklist-hud
swift test
```

Covers: GDL90 bit-decoding against hand-computed values, byte-stuffing & CRC,
a replayed synthetic full flight through every phase, hysteresis, the checklist
controller, and an end-to-end `FlightSession` driven by framed GDL90 datagrams.
(Tests were authored in an environment without a Swift toolchain — run
`swift test` locally to confirm. `SentryUDPListener` is `#if canImport(Network)`
so it compiles out on Linux and the suite still runs.)

## Tuning

`PhaseConfig` exposes all thresholds (taxi/rotate speed, AGL, climb/descent
vertical speed, dwell time). Defaults suit light GA; adjust per aircraft.

## Wiring it up (Sentry → iOS → glasses)

```swift
let session = FlightSession(store: try ChecklistStore.bundled())
session.onDisplayUpdate = { state in glasses.render(state) }   // your Meta renderer

let listener = SentryUDPListener { datagram in
    session.ingest(datagram: datagram)
}
try listener?.start()

// Neural Band gestures:
//   single tap → session.advance()      (check item, move on)
//   swipe back → session.back()
//   two-finger → session.nextSegment()  (tap through ground checklists)
```

### Sentry specifics
- Connect the iPhone to the **Sentry's WiFi** (same network ForeFlight uses).
- Sentry broadcasts GDL90 on **UDP port 4000**. `SentryUDPListener` sets
  `allowLocalEndpointReuse` so it can share :4000 with ForeFlight — **verify in
  flight** that both receive data; if not, the broadcast/unicast behavior may
  need adjusting.
- Sentry also sends extended messages (IDs 37/38: CO, pressure, AHRS) and the
  ForeFlight ID/AHRS message — the decoder safely ignores these; phase detection
  only needs ownship (10) and geometric altitude (11).
- **iOS Local Network permission** is required to receive LAN UDP. Add to
  `Info.plist`:
  ```xml
  <key>NSLocalNetworkUsageDescription</key>
  <string>Receives flight data from your Sentry to drive the checklist.</string>
  ```

## Next steps (not in this core package)

1. **Meta Wearables Device Access Toolkit (Swift)** — implement `GlassesRenderer`
   to draw `DisplayFormatter.text(state)` on the right lens and bind Neural Band
   gestures to the `FlightSession` methods above.
2. **Replay harness** — record real GDL90 datagrams to a file and replay them
   through `FlightSession` to validate phase detection against actual flights.
