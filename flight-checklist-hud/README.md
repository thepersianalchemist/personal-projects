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
| Checklist | `Checklist`, `ChecklistStore`, `ChecklistController` | Editable JSON checklists; map phase → checklist; expose a `DisplayState` for the UI; handle gestures |

Checklists live in `Sources/FlightCore/Resources/checklists.json` — **edit these
to match your aircraft's POH**. The seeded content is a generic light-GA sample.

## Running the tests

```bash
cd flight-checklist-hud
swift test
```

Covers: GDL90 bit-decoding against hand-computed values, byte-stuffing & CRC,
a replayed synthetic full flight through every phase, hysteresis, and the
checklist controller. (Tests were authored in an environment without a Swift
toolchain — run `swift test` locally to confirm.)

## Tuning

`PhaseConfig` exposes all thresholds (taxi/rotate speed, AGL, climb/descent
vertical speed, dwell time). Defaults suit light GA; adjust per aircraft.

## Next steps (iOS + glasses layer — not in this core package)

1. **UDP listener** — an iOS `Network.framework` `NWConnection`/listener that
   joins the receiver's WiFi and feeds bytes to `GDL90Deframer`.
2. **Meta Wearables Device Access Toolkit (Swift)** — render `DisplayState` on
   the right-lens display; map **Neural Band** gesture events to
   `controller.advance()` / `back()` / `toggle()`.
3. **Replay harness** — record real GDL90 datagrams to a file and replay them
   through `FlightCore` to validate phase detection against actual flights.
