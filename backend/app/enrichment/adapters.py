"""Agentic enrichment source adapters.

The interface is deliberately uniform --- `SourceAdapter.fetch()` --- so the agent
loop in `agent.py` can decide *which* sources to call and in what order without
knowing how any of them work. That planner/executor split is what makes this
"agentic" rather than a fixed integration script (report section 8.1.3).

Which sources are real, and why:

  github   REAL   public REST API, no consent flow needed for public data
  mca21    MOCK   per-company and fee-gated; no bulk access exists
  gstn     MOCK   requires the taxpayer's per-pull consent (account aggregator)
  linkedin MOCK   scraping breaks ToS; needs OAuth consent or a licensed partner
  whois    REAL   RDAP (WHOIS's successor): registration date and registrar only

See data/raw/README.md for the full constraint write-up. The mock adapters
return deterministically-seeded, realistically-shaped data and always set
`is_mock=True` so nothing downstream can silently treat them as verified.
"""

from __future__ import annotations

import hashlib
import random
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.core.config import settings


class SourceAdapter(ABC):
    name: str
    is_mock: bool = True

    @abstractmethod
    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        """Return the raw payload. Raise on failure; the agent handles retries."""

    def applicable(self, startup: Any) -> bool:
        return True


def _seed_for(*parts: str) -> random.Random:
    """Stable pseudo-randomness so a given company always mocks the same way."""
    digest = hashlib.sha256("|".join(p or "" for p in parts).encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


# --------------------------------------------------------------------------
# GitHub --- the one genuinely live integration
# --------------------------------------------------------------------------


class GitHubAdapter(SourceAdapter):
    name = "github"
    is_mock = False

    def applicable(self, startup: Any) -> bool:
        return any(f.github_username for f in startup.founders)

    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        headers = {"Accept": "application/vnd.github+json"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"

        out: dict[str, Any] = {"founders": {}}
        async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
            for founder in startup.founders:
                username = founder.github_username
                if not username:
                    continue
                try:
                    user_res = await client.get(f"https://api.github.com/users/{username}")
                    if user_res.status_code == 404:
                        out["founders"][username] = {"error": "user not found"}
                        continue
                    user_res.raise_for_status()
                    user = user_res.json()

                    repo_res = await client.get(
                        f"https://api.github.com/users/{username}/repos",
                        params={"per_page": 100, "sort": "pushed"},
                    )
                    repos = repo_res.json() if repo_res.status_code == 200 else []
                    if not isinstance(repos, list):
                        repos = []

                    out["founders"][username] = {
                        "login": user.get("login"),
                        "name": user.get("name"),
                        "company": user.get("company"),
                        "followers": user.get("followers", 0),
                        "public_repos": user.get("public_repos", 0),
                        "created_at": user.get("created_at"),
                        "total_stars": sum(r.get("stargazers_count", 0) for r in repos),
                        "languages": list(
                            {r.get("language") for r in repos if r.get("language")}
                        )[:8],
                        "recently_pushed_repos": sum(
                            1 for r in repos if r.get("pushed_at", "") >= "2025-01-01"
                        ),
                    }
                except httpx.HTTPError as exc:
                    out["founders"][username] = {"error": str(exc)}
        return out


# --------------------------------------------------------------------------
# Mock adapters --- shaped like the real thing, clearly labelled as not it
# --------------------------------------------------------------------------


class MCA21Adapter(SourceAdapter):
    """Ministry of Corporate Affairs registry lookup.

    Real MCA21 is per-CIN, requires portal registration, and charges a fee for
    anything past the basic fields --- so there is no bulk path. A production
    build calls it one company at a time behind this same interface.
    """

    name = "mca21"

    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        rng = _seed_for("mca21", startup.legal_name)
        registered = rng.random() > 0.08  # most real companies are registered
        founded = startup.founded_date
        cin = startup.cin or (
            f"U{rng.randint(10000, 99999)}KA{founded.year if founded else 2021}"
            f"PTC{rng.randint(100000, 999999)}"
        )
        return {
            "_mock": True,
            "_why_mock": "MCA21 has no bulk/free API; per-company lookup is fee-gated",
            "cin": cin if registered else None,
            "company_status": "Active" if registered else "Not Found",
            "registration_verified": registered,
            "company_class": rng.choice(["Private", "Public"]),
            "authorized_capital_inr": rng.choice([100000, 500000, 1000000, 10000000]),
            "paid_up_capital_inr": rng.choice([100000, 250000, 500000, 5000000]),
            "registered_state": startup.hq_state or "Karnataka",
            "name_matches_filing": rng.random() > 0.06,
            "address_matches_filing": rng.random() > 0.12,
        }


class GSTNAdapter(SourceAdapter):
    """GST filing cross-check --- the revenue verification the platform hinges on.

    Real GSTN data is private to the taxpayer; lawful access is via the
    startup's explicit consent per pull (account-aggregator style), never a
    scrape. The mock reuses the `gst_reported_revenue` already on the financials
    row so the deviation logic downstream is exercised against consistent data.
    """

    name = "gstn"

    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        rng = _seed_for("gstn", startup.legal_name)
        fin = startup.latest_financials
        filed = fin.gst_reported_revenue if fin else None
        claimed = fin.revenue if fin else None
        deviation = None
        if filed and claimed and claimed > 0:
            deviation = abs(claimed - filed) / claimed
        return {
            "_mock": True,
            "_why_mock": "GST return data requires per-pull taxpayer consent, not scrapable",
            "gstin": startup.gstin or f"29AA{rng.randint(1000, 9999)}A1Z{rng.randint(0, 9)}",
            "filing_status": rng.choice(["Regular", "Regular", "Regular", "Composition"]),
            "returns_filed_last_12m": rng.randint(8, 12),
            "gst_reported_annual_revenue": filed,
            "founder_claimed_revenue": claimed,
            "deviation_fraction": round(deviation, 4) if deviation is not None else None,
            "exceeds_threshold": (
                deviation > settings.deviation_threshold if deviation is not None else None
            ),
        }


class LinkedInAdapter(SourceAdapter):
    """Founder employment history and endorsements.

    Scraping LinkedIn violates its ToS (and is the subject of hiQ v. LinkedIn).
    Lawful paths are a consented OAuth flow or a licensed data partner. Mocked
    until one of those exists.
    """

    name = "linkedin"

    def applicable(self, startup: Any) -> bool:
        return bool(startup.founders)

    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        out: dict[str, Any] = {
            "_mock": True,
            "_why_mock": "LinkedIn scraping breaks ToS; needs OAuth consent or licensed partner",
            "founders": {},
        }
        for founder in startup.founders:
            rng = _seed_for("linkedin", startup.legal_name, founder.name)
            n_roles = rng.randint(1, 5)
            out["founders"][founder.name] = {
                "headline": f"{founder.role or 'Founder'} at {startup.legal_name}",
                "prior_exits": rng.choices([0, 0, 0, 1, 1, 2], k=1)[0],
                "domain_experience_years": round(rng.uniform(1.5, 22.0), 1),
                "endorsement_count": rng.randint(0, 340),
                "connection_count": rng.choice([500, 1200, 2500, 4800]),
                "employment_history": [
                    {
                        "company": f"Company {chr(65 + i)}",
                        "title": rng.choice(
                            ["Engineer", "Product Manager", "VP Engineering",
                             "Co-Founder", "Consultant", "Director"]
                        ),
                        "years": round(rng.uniform(0.8, 6.0), 1),
                    }
                    for i in range(n_roles)
                ],
                "profile_matches_claim": rng.random() > 0.1,
            }
        return out


class WhoisAdapter(SourceAdapter):
    """Domain age --- a cheap corroboration of how long a company has existed.

    Uses RDAP, the structured successor to WHOIS. Personal registrant data is
    redacted post-GDPR, but the registration date and registrar are public,
    and those are all this check needs.
    """

    name = "whois"
    is_mock = False

    def applicable(self, startup: Any) -> bool:
        return bool(startup.website)

    async def fetch(self, startup: Any, **kwargs: Any) -> dict[str, Any]:
        from app.onboarding.checks import registrable_domain
        from app.onboarding.fetch import api_get

        domain = registrable_domain(startup.website)
        res = await api_get(f"https://rdap.org/domain/{domain}")
        res.raise_for_status()
        body = res.json()
        registered = next(
            (e.get("eventDate") for e in body.get("events", [])
             if e.get("eventAction") == "registration"),
            None,
        )
        registrar = None
        for ent in body.get("entities", []):
            if "registrar" in (ent.get("roles") or []):
                for item in (ent.get("vcardArray") or [None, []])[1]:
                    if item and item[0] == "fn":
                        registrar = item[3]
        created_year = int(registered[:4]) if registered else None
        founded_year = startup.founded_date.year if startup.founded_date else None
        return {
            "domain": domain,
            "registered": registered,
            "created_year": created_year,
            "registrar": registrar,
            # A domain registered well after the claimed founding date is a
            # mismatch worth surfacing; an older one (bought early) is not.
            "consistent_with_founding_date": (
                None if not (created_year and founded_year) else created_year <= founded_year + 2
            ),
        }


ADAPTERS: dict[str, SourceAdapter] = {
    a.name: a
    for a in (GitHubAdapter(), MCA21Adapter(), GSTNAdapter(), LinkedInAdapter(), WhoisAdapter())
}
