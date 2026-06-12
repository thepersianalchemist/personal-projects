"""Scanner backends and the common signal record they produce.

A *backend* knows how to ask the underlying OS for a list of nearby radio
signals (Wi-Fi access points today, BLE in the future) and normalise them into
`Signal` records. Everything downstream — OUI lookup, distance, risk, intel —
operates on `Signal`, never on a backend's raw output, so adding a new radio
source is just a new backend.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional


def normalize_mac(mac: str) -> str:
    """Return a MAC as lower-case colon-separated hex, or "" if unparseable."""
    if not mac:
        return ""
    cleaned = mac.strip().lower().replace("-", ":").replace(".", ":")
    # Some sources give 12 contiguous hex chars; re-insert colons.
    hexonly = cleaned.replace(":", "")
    if len(hexonly) == 12 and all(c in "0123456789abcdef" for c in hexonly):
        return ":".join(hexonly[i : i + 2] for i in range(0, 12, 2))
    parts = cleaned.split(":")
    if len(parts) == 6 and all(len(p) == 2 for p in parts):
        return cleaned
    return ""


def is_locally_administered(mac: str) -> bool:
    """True if the MAC's locally-administered bit is set.

    Modern phones and many trackers rotate through *randomised* MACs, which
    always have this bit set. Real, fixed surveillance/infrastructure hardware
    usually burns in a globally-unique (vendor-assigned) MAC instead, so this
    flag is a cheap first cut between "someone's phone walking by" and "a box
    bolted to the wall."
    """
    mac = normalize_mac(mac)
    if not mac:
        return False
    first_octet = int(mac.split(":")[0], 16)
    return bool(first_octet & 0x02)


@dataclass
class Signal:
    """One observed radio emitter at one moment in time."""

    bssid: str  # normalized MAC / hardware address (the stable identity)
    rssi: int  # received signal strength, dBm (negative; closer to 0 = stronger)
    kind: str = "wifi"  # wifi | ble
    ssid: str = ""  # network name; "" means hidden or n/a
    frequency_mhz: Optional[int] = None  # channel center frequency, if known
    channel: Optional[int] = None
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.bssid = normalize_mac(self.bssid)

    @property
    def hidden(self) -> bool:
        return self.kind == "wifi" and self.ssid.strip() == ""

    @property
    def randomized(self) -> bool:
        return is_locally_administered(self.bssid)

    @property
    def oui(self) -> str:
        """First 24 bits (vendor portion) as `aabbcc`, or "" if unknown."""
        if not self.bssid:
            return ""
        return self.bssid.replace(":", "")[:6]

    @property
    def band(self) -> str:
        f = self.frequency_mhz
        if f is None:
            return "?"
        if 2400 <= f <= 2500:
            return "2.4GHz"
        if 4900 <= f <= 5900:
            return "5GHz"
        if 5925 <= f <= 7125:
            return "6GHz"
        return "?"


class Scanner:
    """Base class for scan backends."""

    name = "base"

    def available(self) -> bool:
        """Whether this backend can run in the current environment."""
        raise NotImplementedError

    def scan(self) -> list[Signal]:
        """Return the currently visible signals. One sweep, no blocking loop."""
        raise NotImplementedError
