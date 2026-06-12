"""Termux (Android) backend.

Uses `termux-wifi-scaninfo` from the Termux:API package, which returns the last
Wi-Fi scan as JSON. This is the primary deployment target — a stock Android
phone, no root, airplane-mode friendly (Wi-Fi scanning still works with Wi-Fi
toggled on while cellular/airplane is configured to your taste).
"""

from __future__ import annotations

import json
import shutil
import subprocess

from .base import Scanner, Signal


def _freq_to_channel(freq: int | None) -> int | None:
    if not freq:
        return None
    if 2412 <= freq <= 2472:
        return (freq - 2412) // 5 + 1
    if freq == 2484:
        return 14
    if 5000 <= freq <= 5900:
        return (freq - 5000) // 5
    if 5955 <= freq <= 7115:
        return (freq - 5955) // 5 + 1
    return None


class TermuxScanner(Scanner):
    name = "termux"

    def __init__(self, binary: str = "termux-wifi-scaninfo", timeout: float = 15.0):
        self.binary = binary
        self.timeout = timeout

    def available(self) -> bool:
        return shutil.which(self.binary) is not None

    def scan(self) -> list[Signal]:
        proc = subprocess.run(
            [self.binary],
            capture_output=True,
            text=True,
            timeout=self.timeout,
        )
        return self.parse(proc.stdout)

    @staticmethod
    def parse(raw: str) -> list[Signal]:
        """Parse `termux-wifi-scaninfo` JSON output into Signals.

        Split out from `scan` so it can be unit-tested against captured output
        without an Android device in the loop.
        """
        raw = (raw or "").strip()
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if isinstance(data, dict):
            data = [data]
        signals: list[Signal] = []
        for ap in data:
            if not isinstance(ap, dict):
                continue
            freq = ap.get("frequency_mhz") or ap.get("frequency")
            signals.append(
                Signal(
                    bssid=ap.get("bssid", ""),
                    rssi=int(ap.get("rssi", ap.get("level", -100))),
                    kind="wifi",
                    ssid=ap.get("ssid", "") or "",
                    frequency_mhz=int(freq) if freq else None,
                    channel=ap.get("channel") or _freq_to_channel(int(freq) if freq else None),
                )
            )
        return [s for s in signals if s.bssid]
