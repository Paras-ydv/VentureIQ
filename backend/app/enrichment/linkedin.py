"""Founder LinkedIn insights through a third-party RapidAPI provider.

Provenance, stated plainly: this is a commercial aggregator that scrapes
LinkedIn. LinkedIn's terms prohibit scraping, so this is *not* the consented
OAuth flow or licensed partnership that `data/raw/README.md` describes as the
lawful path. It is therefore:

  - off by default (no `VIQ_RAPIDAPI_KEY`, no calls);
  - recorded with `source="linkedin"`, `is_mock=False`, and a `_provenance`
    field naming the aggregator, so the profile never implies LinkedIn itself
    confirmed anything;
  - used to corroborate a founder's own claim (their name, their current
    company), never to mark a company field verified.

The response shape of these providers changes without notice, so the parser
below reads defensively and keeps the raw payload. `scripts/check_linkedin.py`
prints both, which is how you check a provider still matches.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import settings

PROVENANCE = "third-party aggregator (scraped LinkedIn data), not LinkedIn's own API"

_EXPERIENCE_KEYS = ("experiences", "experience", "positions", "position",
                    "workExperience", "work_experience", "position_groups")
_EDUCATION_KEYS = ("educations", "education", "schools", "education_history")
_FOUNDER_TITLE = re.compile(r"\b(founder|co-?founder|cofounder)\b", re.I)
_EXIT_HINT = re.compile(r"\b(acquired|acquisition|exited|exit|ipo|merged)\b", re.I)


def enabled() -> bool:
    return bool(settings.rapidapi_key)


def handle_from(url_or_handle: str | None) -> str | None:
    """'https://linkedin.com/in/foo/' or '@foo' or 'foo' → 'foo'."""
    if not url_or_handle:
        return None
    s = str(url_or_handle).strip().rstrip("/")
    m = re.search(r"linkedin\.com/(?:in|pub)/([^/?#]+)", s, re.I)
    if m:
        return m.group(1)
    if "linkedin.com" in s.lower():
        return None  # a company page or something else, not a person
    return s.lstrip("@") or None


async def fetch_profile(handle: str) -> dict[str, Any]:
    """Raw provider payload for one profile. Raises httpx.HTTPError."""
    if not enabled():
        raise RuntimeError("VIQ_RAPIDAPI_KEY is not set")
    host = settings.linkedin_api_host
    async with httpx.AsyncClient(timeout=25) as client:
        res = await client.get(
            f"https://{host}{settings.linkedin_api_path}",
            params={settings.linkedin_api_param: handle},
            headers={"x-rapidapi-key": settings.rapidapi_key, "x-rapidapi-host": host},
        )
    res.raise_for_status()
    return res.json()


# --------------------------------------------------------------------------
# parsing — tolerant, because provider shapes differ and drift
# --------------------------------------------------------------------------


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _first(raw: Any, *names: str) -> Any:
    for node in _walk(raw):
        for n in names:
            v = node.get(n)
            if isinstance(v, (str, int, float)) and str(v).strip():
                return v
    return None


def _list_of_dicts(raw: Any, names: tuple[str, ...]) -> list[dict]:
    for node in _walk(raw):
        for n in names:
            v = node.get(n)
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
                return v
    return []


def _years(*texts: Any) -> list[int]:
    out: list[int] = []
    for t in texts:
        out += [int(y) for y in re.findall(r"(19\d{2}|20\d{2})", str(t or ""))]
    return out


def _int(v: Any) -> int | None:
    if v is None:
        return None
    m = re.search(r"\d[\d,]*", str(v))
    return int(m.group(0).replace(",", "")) if m else None


def parse_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """Provider payload → the founder-credibility fields the scorer reads."""
    name = _first(raw, "full_name", "fullName", "name", "profile_name") or None
    first, last = _first(raw, "first_name", "firstName"), _first(raw, "last_name", "lastName")
    if not name and (first or last):
        name = " ".join(str(x) for x in (first, last) if x)

    positions = []
    for p in _list_of_dicts(raw, _EXPERIENCE_KEYS):
        company = p.get("company") or p.get("companyName") or p.get("company_name") or p.get("organisation")
        if isinstance(company, dict):
            company = company.get("name")
        title = p.get("title") or p.get("position") or p.get("role") or p.get("job_title")
        span = " ".join(str(p.get(k, "")) for k in
                        ("date_range", "dateRange", "duration", "start_date", "starts_at",
                         "end_date", "ends_at", "startDate", "endDate", "period"))
        yrs = _years(span, p.get("start_date"), p.get("end_date"))
        current = bool(p.get("is_current") or p.get("current")) or "present" in span.lower()
        if company or title:
            positions.append({
                "company": str(company) if company else None,
                "title": str(title) if title else None,
                "start_year": min(yrs) if yrs else None,
                "end_year": None if current else (max(yrs) if yrs else None),
                "current": current,
                "description": str(p.get("description") or "")[:400] or None,
            })

    schools = []
    for e in _list_of_dicts(raw, _EDUCATION_KEYS):
        school = e.get("school") or e.get("schoolName") or e.get("name") or e.get("institute")
        if isinstance(school, dict):
            school = school.get("name")
        if school:
            schools.append({"school": str(school), "degree": str(e.get("degree") or e.get("degree_name") or "") or None})

    starts = [p["start_year"] for p in positions if p["start_year"]]
    career_start = min(starts) if starts else None
    this_year = datetime.now(UTC).year
    founder_roles = [p for p in positions if p["title"] and _FOUNDER_TITLE.search(p["title"])]
    # Profiles have no structured "exit" field, so this only counts what the
    # person wrote themselves, and it is labelled self-reported downstream.
    exit_hints = [p for p in positions
                  if p["description"] and _EXIT_HINT.search(p["description"])]

    return {
        "_provenance": PROVENANCE,
        "name": name,
        "headline": _first(raw, "headline", "sub_title", "subTitle", "occupation"),
        "location": _first(raw, "location", "geo", "locationName", "city"),
        "current_company": next((p["company"] for p in positions if p["current"]), None),
        "current_title": next((p["title"] for p in positions if p["current"]), None),
        "connections": _int(_first(raw, "connections", "connection", "connection_count", "connectionsCount")),
        "followers": _int(_first(raw, "followers", "follower_count", "followersCount")),
        "positions": positions[:12],
        "education": schools[:5],
        "career_start_year": career_start,
        "domain_experience_years": round(this_year - career_start, 1) if career_start else None,
        "prior_founder_roles": max(0, len(founder_roles) - 1),
        "self_reported_exits": len(exit_hints) or None,
        "profile_complete": bool(name and positions),
    }


def matches(profile: dict[str, Any], founder_name: str, company: str | None) -> dict[str, Any]:
    """Does this profile look like the person who claims it, at this company?"""
    from app.onboarding.checks import compare, norm_text

    name_ok = compare("name", founder_name, profile.get("name") or "") == "agree"
    companies = [p["company"] for p in profile.get("positions", []) if p.get("company")]
    company_ok = bool(company) and any(
        compare("name", company, c) == "agree" for c in companies[:6]
    )
    headline_ok = bool(company) and norm_text(company) in norm_text(profile.get("headline") or "")
    bits = []
    if profile.get("current_title") and profile.get("current_company"):
        bits.append(f"{profile['current_title']} at {profile['current_company']}")
    if profile.get("domain_experience_years"):
        bits.append(f"{profile['domain_experience_years']:.0f} yrs since first role")
    if profile.get("connections"):
        bits.append(f"{profile['connections']:,} connections")
    return {
        "name_matches": name_ok,
        "company_matches": company_ok or headline_ok,
        "summary": " · ".join(bits) or "profile found",
    }
