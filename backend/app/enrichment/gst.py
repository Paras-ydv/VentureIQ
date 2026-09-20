"""GSTIN verification against the public GST taxpayer search.

What is public and what is not, precisely:

- *Taxpayer details* — legal name, trade name, status, registration date,
  constitution, state jurisdiction — are published by the GST portal's own
  "Search Taxpayer" service. Several vendors resell that as an API, which is
  what this module calls when one is configured.
- *Returns and turnover* are private to the taxpayer. They are lawfully
  obtainable only with the taxpayer's per-pull consent through a GST Suvidha
  Provider, so revenue reconciliation stays a clearly-labelled mock.

Configure a vendor with VIQ_GST_API_HOST/PATH/PARAM (RapidAPI-style hosts use
VIQ_RAPIDAPI_KEY). Responses are cached and counted against the same monthly
budget as the other paid lookups, so a free tier is not burned by retries.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import settings
from app.enrichment.linkedin import QuotaExceeded, _cache, _this_month, usage

SOURCE = "GST taxpayer search (public register, via API vendor)"


def enabled() -> bool:
    return bool(settings.gst_api_host and settings.rapidapi_key)


def _store(gstin: str, raw: dict[str, Any]) -> None:
    conn = _cache()
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS gst_profile (
                   gstin TEXT PRIMARY KEY, fetched_at TEXT NOT NULL, raw TEXT NOT NULL)"""
        )
        conn.execute("INSERT OR REPLACE INTO gst_profile (gstin, fetched_at, raw) VALUES (?, ?, ?)",
                     (gstin, datetime.now(UTC).isoformat(timespec="seconds"), json.dumps(raw)))
        conn.execute("""INSERT INTO api_usage (provider, month, calls) VALUES ('rapidapi', ?, 1)
                        ON CONFLICT(provider, month) DO UPDATE SET calls = calls + 1""", (_this_month(),))
        conn.commit()
    finally:
        conn.close()


def cached(gstin: str) -> dict[str, Any] | None:
    conn = _cache()
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS gst_profile (
                   gstin TEXT PRIMARY KEY, fetched_at TEXT NOT NULL, raw TEXT NOT NULL)"""
        )
        row = conn.execute("SELECT raw FROM gst_profile WHERE gstin = ?", (gstin,)).fetchone()
    except sqlite3.Error:
        return None
    finally:
        conn.close()
    return json.loads(row["raw"]) if row else None


async def fetch(gstin: str, *, refresh: bool = False) -> dict[str, Any]:
    """Raw vendor payload for one GSTIN, cached. Raises httpx.HTTPError."""
    gstin = gstin.strip().upper()
    if not refresh:
        hit = cached(gstin)
        if hit is not None:
            hit["_cache"] = "hit"
            return hit
    if not enabled():
        raise RuntimeError("No GST API configured (VIQ_GST_API_HOST / VIQ_RAPIDAPI_KEY)")
    if usage()["remaining"] <= 0:
        raise QuotaExceeded("the monthly API budget is spent; cached lookups still work")

    host = settings.gst_api_host
    url = f"https://{host}{settings.gst_api_path}"
    params = {settings.gst_api_param: gstin} if settings.gst_api_param else {}
    if "{gstin}" in settings.gst_api_path:
        url = f"https://{host}{settings.gst_api_path.replace('{gstin}', gstin)}"
        params = {}
    async with httpx.AsyncClient(timeout=25) as client:
        res = await client.get(url, params=params, headers={
            "x-rapidapi-key": settings.rapidapi_key, "x-rapidapi-host": host})
    res.raise_for_status()
    raw = res.json()
    _store(gstin, raw)
    raw["_cache"] = "miss"
    return raw


# --------------------------------------------------------------------------
# parsing — vendors differ, so read defensively and keep the raw payload
# --------------------------------------------------------------------------

_KEYS = {
    "legal_name": ("lgnm", "legal_name", "legalName", "legal_name_of_business", "name"),
    "trade_name": ("tradeNam", "trade_name", "tradeName", "tradenam"),
    "status": ("sts", "status", "gstin_status", "registration_status"),
    "registration_date": ("rgdt", "registration_date", "registrationDate", "date_of_registration"),
    "constitution": ("ctb", "constitution", "constitution_of_business", "business_constitution"),
    "taxpayer_type": ("dty", "taxpayer_type", "taxpayerType", "dealer_type"),
    "state": ("stj", "state_jurisdiction", "state", "stateJurisdiction"),
    "pan": ("pan", "panNo", "pan_number"),
}


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _first(raw: Any, names: tuple[str, ...]) -> Any:
    for node in _walk(raw):
        for n in names:
            v = node.get(n)
            if isinstance(v, (str, int, float)) and str(v).strip():
                return str(v).strip()
    return None


def _iso_date(value: str | None) -> str | None:
    if not value:
        return None
    for pattern, order in ((r"^(\d{2})/(\d{2})/(\d{4})$", "dmy"), (r"^(\d{4})-(\d{2})-(\d{2})$", "ymd")):
        m = re.match(pattern, value.strip())
        if m:
            a, b, c = m.groups()
            return f"{c}-{b}-{a}" if order == "dmy" else f"{a}-{b}-{c}"
    return value.strip()[:10]


def parse(raw: dict[str, Any]) -> dict[str, Any]:
    out = {key: _first(raw, names) for key, names in _KEYS.items()}
    out["registration_date"] = _iso_date(out.get("registration_date"))
    out["active"] = (out.get("status") or "").strip().lower() in ("active", "act", "yes")
    out["_source"] = SOURCE
    return out
