"""Evaluation for the VentureIQ paper: verification (Table 2), source coverage
and latency (Table 3), and scoring-model performance (Table 4).

    .venv/bin/python scripts/evaluate.py --all          # everything
    .venv/bin/python scripts/evaluate.py --collect      # live agent runs only
    .venv/bin/python scripts/evaluate.py --replay       # Table 2 from saved runs
    .venv/bin/python scripts/evaluate.py --models       # Table 4 only

Results go to docs/evaluation/results.json, with the company list beside it.

Protocol
--------
*Companies.* 42 Indian companies, from household names to small B2B firms,
each with a public website and a registered entity on the MCA register. Brand
names rarely match legal names (CRED is Dreamplug Technologies, Mamaearth is
Honasa Consumer), so every brand-to-entity mapping is listed in
companies.csv for a reader to check.

*Ground truth.* For each company, the record for its CIN in the MCA Company
Master Data: registered name, incorporation date, registered-office state and
city. This is the official dataset, but it was not re-checked by hand against
the MCA portal; a paper claiming "verified manually" needs that step done on
at least a sample.

*Collection.* The registration agent runs once per company, live, with the
founder's inputs a real founder would give: website, work email, name, stage,
registered name and CIN. Every source call is timed. This run supplies
Table 3 and the evidence for Table 2.

*Perturbation.* Against the evidence each live run gathered, claims are
replayed: the correct claim set, and perturbed sets each altering one field
(k = 1). Single-field perturbations are deliberate: they let a detection be
attributed to the field that was changed. Perturbations are kept outside the
system's own tolerances (a year off by four, not one), since a change inside a
tolerance is accepted by design. Swapped and corrupted CINs are not replayed:
a different CIN changes what the registry returns, so the real registry
lookup runs again for those.

*Scoring.* A field counts as flagged when it comes out conflicted. Positives
are the perturbed claims for a field, negatives are its correct claims, so
precision and recall are those of a per-field binary decision. Coverage is
the share of companies for which at least one independent source returned a
value comparable with the claim.

*Reconciliation rules.* Three are scored on identical evidence: the original
rule (any agreeing source outvotes any disagreeing one), "any disagreement is
a conflict", and the rule now in the code (an authoritative source settles
the field when present; otherwise any disagreement is a conflict).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import statistics
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

OUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "evaluation"
RUNS_PATH = OUT_DIR / "agent_runs.json"
RESULTS_PATH = OUT_DIR / "results.json"

# brand, website, CIN --- each CIN confirmed Active in the MCA master data.
COMPANIES = [
    ("Flipkart", "flipkart.com", "U51109KA2012PTC066107"),
    ("Paytm", "paytm.com", "L72200DL2000PLC108985"),
    ("Zomato", "zomato.com", "L93030DL2010PLC198141"),
    ("Swiggy", "swiggy.com", "L74110KA2013PLC096530"),
    ("Ola", "olacabs.com", "U72900KA2010PTC086596"),
    ("Meesho", "meesho.com", "L74900KA2015PLC082263"),
    ("Zerodha", "zerodha.com", "U65929KA2018PLC116815"),
    ("PhonePe", "phonepe.com", "U67190KA2012PLC176031"),
    ("CRED", "cred.club", "U93090MH2018PTC308253"),
    ("Nykaa", "nykaa.com", "L52600MH2012PLC230136"),
    ("Lenskart", "lenskart.com", "L33100DL2008PLC178355"),
    ("boAt", "boat-lifestyle.com", "U52300MH2013PLC249758"),
    ("Urban Company", "urbancompany.com", "L74140DL2014PLC274413"),
    ("Freshworks", "freshworks.com", "U72200TN2010PTC078458"),
    ("Zoho", "zoho.com", "U40100TN2010PTC075961"),
    ("MakeMyTrip", "makemytrip.com", "U63040HR2000PTC090846"),
    ("Policybazaar", "policybazaar.com", "U74999HR2014PTC053454"),
    ("Delhivery", "delhivery.com", "L63090DL2011PLC221234"),
    ("Mamaearth", "mamaearth.in", "L74999DL2016PLC306016"),
    ("Ixigo", "ixigo.com", "L63000HR2006PLC071540"),
    ("Dream11", "dream11.com", "U72900MH2007PTC171875"),
    ("Unacademy", "unacademy.com", "U72200KA2015PTC082063"),
    ("upGrad", "upgrad.com", "U80902MH2012PTC258559"),
    ("Vedantu", "vedantu.com", "U72900KA2011PTC060958"),
    ("Licious", "licious.in", "U74900KA2015PTC080321"),
    ("Rapido", "rapido.bike", "U52210TG2015PTC097115"),
    ("Cars24", "cars24.com", "U74999HR2015FTC056386"),
    ("Spinny", "spinny.com", "U74999HR2019PTC077781"),
    ("ShareChat", "sharechat.com", "U74999KA2015PTC103797"),
    ("BharatPe", "bharatpe.com", "U74999DL2018PTC331205"),
    ("Jupiter", "jupiter.money", "U63119MH2019PTC328769"),
    ("PharmEasy", "pharmeasy.in", "U60100MH2019PLC323444"),
    ("Udaan", "udaan.com", "U72900KA2016PTC093868"),
    ("Wakefit", "wakefit.co", "L52590KA2016PLC086582"),
    ("InMobi", "inmobi.com", "U72900HR2011PTC129638"),
    ("Innovaccer", "innovaccer.com", "U74140UP2013PTC202874"),
    ("Darwinbox", "darwinbox.com", "U74900TG2015PTC101793"),
    ("BrowserStack", "browserstack.com", "U74120MH2015PTC264476"),
    ("Chargebee", "chargebee.com", "U72900TN2012PTC084306"),
    ("Exotel", "exotel.com", "U72900KA2011PTC059065"),
    ("Fyle", "fylehq.com", "U74900KA2016PTC086218"),
    ("Hasura", "hasura.io", "U72900KA2017PTC104083"),
]

EVAL_FIELDS = ["legal_name", "founded_year", "hq_city", "hq_state", "cin"]
CITIES = [("Mumbai", "Maharashtra"), ("Bengaluru", "Karnataka"), ("Delhi", "Delhi"),
          ("Chennai", "Tamil Nadu"), ("Hyderabad", "Telangana"), ("Kolkata", "West Bengal"),
          ("Ahmedabad", "Gujarat"), ("Jaipur", "Rajasthan"), ("Gurugram", "Haryana"),
          ("Lucknow", "Uttar Pradesh")]
RULES = ("outvote", "any_disagreement", "authority_aware")


def _pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def _truth(cin: str) -> dict[str, Any] | None:
    from app.registry import store as registry

    rec = registry.get_local(cin)
    if not rec:
        return None
    return {
        "legal_name": rec["name"],
        "founded_year": int(rec["registered"][:4]) if rec.get("registered") else None,
        "hq_city": rec.get("city"),
        "hq_state": rec.get("state"),
        "cin": rec["cin"],
    }


# --------------------------------------------------------------------------
# collection: one live agent run per company (Table 3, and Table 2's evidence)
# --------------------------------------------------------------------------


async def _collect_one(brand: str, website: str, cin: str, sem: asyncio.Semaphore) -> dict:
    from app.onboarding import agent, checks

    truth = _truth(cin)
    async with sem:
        domain = checks.registrable_domain(website)
        run = agent.create_session({
            "website": checks.normalise_website(website),
            "email": f"founder@{domain}",
            "founder_name": "Evaluation Run",
            "stage": "series_a",
            "legal_name": truth["legal_name"] if truth else brand,
            "cin": cin,
            "gstin": None,
            "gst_consent": False,
        })
        t0 = time.monotonic()
        try:
            await agent.execute(run)
        except Exception as exc:  # a crashed run is a result too
            run.status = f"error: {exc}"
        total = time.monotonic() - t0

    findings: dict[str, int] = {}
    for ev in run.events:
        if ev.get("type") == "finding" and ev.get("tool"):
            findings[ev["tool"]] = findings.get(ev["tool"], 0) + 1
    tools = [
        {"key": key, "tool": r["tool"], "ok": r["ok"], "ms": r["ms"], "kind": r.get("kind"),
         "findings": findings.get(key, 0), "error": r.get("error"),
         "how": (r.get("data") or {}).get("how")}
        for key, r in run.tool_results.items()
    ]
    return {"brand": brand, "website": website, "cin": cin, "truth": truth,
            "session_id": run.session_id, "status": run.status, "total_s": round(total, 2),
            "tools": tools, "evidence": run.evidence}


async def collect(concurrency: int = 3) -> list[dict]:
    sem = asyncio.Semaphore(concurrency)
    tasks = [_collect_one(b, w, c, sem) for b, w, c in COMPANIES]
    out = []
    for i, coro in enumerate(asyncio.as_completed(tasks), 1):
        r = await coro
        ok = sum(t["ok"] for t in r["tools"])
        print(f"  [{i:>2}/{len(COMPANIES)}] {r['brand']:<14} {r['total_s']:>5.1f}s  "
              f"{ok}/{len(r['tools'])} sources answered  ({r['status']})")
        out.append(r)
    _cleanup_sessions([r["session_id"] for r in out])
    return out


def _cleanup_sessions(ids: list[str]) -> None:
    """Evaluation sessions are never submitted; don't leave them behind."""
    from app.core.database import SessionLocal
    from app.models import OnboardingSession

    db = SessionLocal()
    try:
        db.query(OnboardingSession).filter(OnboardingSession.session_id.in_(ids)).delete(
            synchronize_session=False)
        db.commit()
    finally:
        db.close()


def table3(runs: list[dict]) -> dict[str, Any]:
    by_tool: dict[str, list[dict]] = {}
    for r in runs:
        for t in r["tools"]:
            by_tool.setdefault(t["tool"], []).append(t)
    rows = {}
    for tool, calls in sorted(by_tool.items()):
        ms = [c["ms"] / 1000 for c in calls if c["kind"] != "local"]
        rows[tool] = {
            "calls": len(calls),
            "responded_pct": round(100 * sum(c["ok"] for c in calls) / len(calls), 1),
            # Answered AND contributed at least one value to the profile.
            "usable_pct": round(100 * sum(c["ok"] and c["findings"] > 0 for c in calls) / len(calls), 1),
            "median_s": round(statistics.median(ms), 2) if ms else None,
            "p95_s": round(_pct(ms, 0.95), 2) if ms else None,
            "from_local_copy_pct": (round(100 * sum(c["how"] == "local" for c in calls) / len(calls), 1)
                                    if tool == "mca21" else None),
            "errors": sorted({(c["error"] or "")[:80] for c in calls if not c["ok"]})[:5],
        }
    totals = [r["total_s"] for r in runs]
    rows["_end_to_end"] = {
        "runs": len(runs),
        "completed_pct": round(100 * sum(r["status"] == "ready" for r in runs) / len(runs), 1),
        "median_s": round(statistics.median(totals), 2),
        "p95_s": round(_pct(totals, 0.95), 2),
    }
    return rows


# --------------------------------------------------------------------------
# replay: perturbed claim sets against collected evidence (Table 2)
# --------------------------------------------------------------------------


def _flags(row: dict) -> dict[str, bool]:
    """Would each reconciliation rule flag this field?"""
    ev = row.get("evidence") or []
    live = [e for e in ev if e.get("kind") in ("network", "dataset")]
    la = any(e.get("verdict") == "agree" for e in live)
    ld = any(e.get("verdict") == "disagree" for e in live)
    blocking = any(e.get("blocking") and e.get("verdict") == "disagree"
                   for e in ev if e.get("kind") not in ("network", "dataset"))
    return {
        "outvote": (not la) and (ld or blocking),
        "any_disagreement": ld or ((not la) and blocking),
        "authority_aware": row["status"] in ("conflict", "disputed"),
    }


def _classify(claims: dict[str, Any], evidence: dict) -> dict[str, dict]:
    from app.onboarding.ledger import reconcile

    led = reconcile({**claims, "stage": "series_a"}, evidence, {})
    out = {}
    for row in led["fields"]:
        if row["key"] not in EVAL_FIELDS or claims.get(row["key"]) is None:
            continue
        live = [e for e in (row.get("evidence") or []) if e.get("kind") in ("network", "dataset")]
        out[row["key"]] = {
            "flags": _flags(row),
            "comparable": any(e.get("verdict") in ("agree", "disagree") for e in live),
            "disagreeing_sources": sorted({e.get("tool") for e in live if e.get("verdict") == "disagree"}),
        }
    return out


async def _evidence_for_cin(base_evidence: dict, cin: str) -> tuple[dict, str]:
    """The evidence the agent would hold had the founder typed this CIN."""
    from app.onboarding import agent
    from app.onboarding.tools import RUNNERS, ToolError

    kept = {k: [e for e in v if e.get("source") not in ("mca21", "cin_check")]
            for k, v in base_evidence.items()}
    run = agent.Run(SimpleNamespace(
        session_id="replay", status="running", inputs={"cin": cin}, evidence=kept,
        overrides={}, tool_results={}, events=[], startup_id=None, user_id=None))
    import httpx

    outcome = "resolved"
    for tool in ("cin_check", "mca21"):
        try:
            res = await asyncio.wait_for(RUNNERS[tool](run, {"cin": cin, "name": None}), 20)
            if tool == "mca21" and not (res.get("data") or {}).get("found"):
                outcome = "not in register"
        except ToolError as exc:
            outcome = f"{tool} refused: {exc}"[:80]
        except (httpx.HTTPError, TimeoutError) as exc:
            # A CIN missing from the local copy falls through to the live
            # data.gov.in API. When that fails the agent's loop records the
            # source as failed and carries on without it --- reproduced here,
            # rather than crashing the replay.
            outcome = f"registry unreachable ({type(exc).__name__})"
    return run.evidence, outcome


def _typo(name: str) -> str:
    """Swap two letters inside the first word: a near-miss, not an impostor."""
    words = name.split()
    w = words[0]
    if len(w) >= 4:
        words[0] = w[:1] + w[2] + w[1] + w[3:]
    return " ".join(words)


async def replay(runs: list[dict]) -> dict[str, Any]:
    usable = [r for r in runs if r["truth"] and r["status"] == "ready"]
    n = len(usable)
    # tallies[field][rule] = {"tp","fn","fp","tn"}
    tally = {f: {rule: {"tp": 0, "fn": 0, "fp": 0, "tn": 0} for rule in RULES} for f in EVAL_FIELDS}
    coverage = {f: [0, 0] for f in EVAL_FIELDS}
    rdap_year = {"backdated": [0, 0], "postdated": [0, 0]}
    name_tolerance = [0, 0]
    cin_cases: list[dict] = []
    false_positive_examples: list[dict] = []

    for i, r in enumerate(usable):
        truth = {k: v for k, v in r["truth"].items() if v is not None}
        ev = r["evidence"]

        base = _classify(truth, ev)
        for f, res in base.items():
            coverage[f][1] += 1
            coverage[f][0] += res["comparable"]
            for rule in RULES:
                if res["flags"][rule]:
                    tally[f][rule]["fp"] += 1
                    if rule == "authority_aware":
                        false_positive_examples.append({
                            "company": r["brand"], "field": f, "claimed": truth[f],
                            "disagreeing_sources": res["disagreeing_sources"]})
                else:
                    tally[f][rule]["tn"] += 1

        other = usable[(i + 7) % n]["truth"]
        city_alt = next(c for c in CITIES[i % len(CITIES):] + CITIES
                        if c[1] != truth.get("hq_state"))
        state_alt = next(s for _, s in CITIES[(i + 3) % len(CITIES):] + CITIES
                         if s != truth.get("hq_state"))
        perturbations: list[tuple[str, Any, str]] = [
            ("legal_name", other["legal_name"], "impersonation"),
        ]
        if truth.get("founded_year"):
            perturbations += [("founded_year", truth["founded_year"] - 4, "backdated"),
                              ("founded_year", truth["founded_year"] + 4, "postdated")]
        if truth.get("hq_city"):
            perturbations.append(("hq_city", city_alt[0], "other city"))
        if truth.get("hq_state"):
            perturbations.append(("hq_state", state_alt, "other state"))

        for field, value, kind in perturbations:
            res = _classify({**truth, field: value}, ev).get(field)
            if res is None:
                continue
            for rule in RULES:
                tally[field][rule]["tp" if res["flags"][rule] else "fn"] += 1
            if field == "founded_year":
                rdap_year[kind][1] += 1
                rdap_year[kind][0] += "rdap" in res["disagreeing_sources"]

        # A typo in one's own name is tolerated by design; measure how often.
        tol = _classify({**truth, "legal_name": _typo(truth["legal_name"])}, ev).get("legal_name")
        if tol:
            name_tolerance[1] += 1
            name_tolerance[0] += not tol["flags"]["authority_aware"]

        # CINs: re-run the real registry lookup, judge the whole claim set.
        swapped = usable[(i + 11) % n]["cin"]
        corrupted = r["cin"][:-1] + str((int(r["cin"][-1]) + 3) % 10)
        for kind, cin_value in (("another company's CIN", swapped), ("one digit changed", corrupted)):
            cin_ev, outcome = await _evidence_for_cin(ev, cin_value)
            res = _classify({**truth, "cin": cin_value}, cin_ev)
            caught = {rule: any(x["flags"][rule] for x in res.values()) for rule in RULES}
            by = sorted(f for f, x in res.items() if x["flags"]["authority_aware"])
            cin_cases.append({"company": r["brand"], "kind": kind, "registry": outcome,
                              "caught": caught, "flagged_fields": by})

    def summarise(t: dict[str, int]) -> dict[str, Any]:
        tp, fn, fp, tn = t["tp"], t["fn"], t["fp"], t["tn"]
        return {
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "false_positive_rate": round(fp / (fp + tn), 3) if fp + tn else None,
            **t,
        }

    fields = {}
    for f in EVAL_FIELDS:
        if f == "cin":
            continue
        fields[f] = {
            "coverage_pct": round(100 * coverage[f][0] / coverage[f][1], 1) if coverage[f][1] else None,
            "rules": {rule: summarise(tally[f][rule]) for rule in RULES},
        }
    cin_summary = {}
    for kind in ("another company's CIN", "one digit changed"):
        cases = [c for c in cin_cases if c["kind"] == kind]
        cin_summary[kind] = {
            "n": len(cases),
            "caught_pct": {rule: round(100 * sum(c["caught"][rule] for c in cases) / len(cases), 1)
                           for rule in RULES} if cases else None,
            "registry_outcomes": {o: sum(c["registry"] == o for c in cases)
                                  for o in sorted({c["registry"] for c in cases})},
            "caught_via": {f: sum(f in c["flagged_fields"] for c in cases)
                           for f in EVAL_FIELDS},
        }
    return {
        "companies": n,
        "fields": fields,
        "cin": cin_summary,
        "domain_age_rdap": {k: {"caught": v[0], "of": v[1]} for k, v in rdap_year.items()},
        "name_typo_tolerated": {"accepted": name_tolerance[0], "of": name_tolerance[1]},
        "false_positives_on_correct_claims": false_positive_examples,
    }


# --------------------------------------------------------------------------
# scoring models (Table 4)
# --------------------------------------------------------------------------


def models() -> dict[str, Any]:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import StratifiedKFold, train_test_split
    from sklearn.preprocessing import StandardScaler

    from app.core.config import ARTIFACTS
    from app.ml.train import _load_yc, _make_pipeline, build_frame

    out: dict[str, Any] = {}

    # Growth: five-fold CV on the same data and pipeline the deployed model uses.
    X, y, texts = build_frame(_load_yc())
    X["description"] = texts
    folds = StratifiedKFold(5, shuffle=True, random_state=42)

    def cv(frame) -> list[float]:
        scores = []
        for tr, te in folds.split(frame, y):
            pipe = _make_pipeline()
            pipe.fit(frame.iloc[tr], y[tr])
            scores.append(float(roc_auc_score(y[te], pipe.predict_proba(frame.iloc[te])[:, 1])))
        return scores

    full = cv(X)
    # `is_top_company` is YC's own editorial "top company" flag, awarded on
    # outcomes. It is close to a label leak in training, and it is always 0
    # when the model scores a company that is not in YC's directory.
    no_top = X.copy()
    no_top["is_top_company"] = 0.0
    without_top = cv(no_top)
    age = []
    for tr, te in folds.split(X, y):
        sc = StandardScaler().fit(X.iloc[tr][["company_age_years"]])
        m = LogisticRegression(max_iter=500).fit(sc.transform(X.iloc[tr][["company_age_years"]]), y[tr])
        age.append(float(roc_auc_score(y[te], m.predict_proba(
            sc.transform(X.iloc[te][["company_age_years"]]))[:, 1])))
    stored = json.loads((ARTIFACTS / "growth_metrics.json").read_text())
    out["growth"] = {
        "data": (f"{len(X):,} labelled Y Combinator companies ({int(y.sum())} acquired or public, "
                 f"{int((1 - y).sum())} inactive; active companies excluded as unresolved)"),
        "predicts": "P(acquired or public) vs inactive",
        "holdout_auroc": stored["comparison"][stored["chosen_model"]]["auroc"],
        "cv5_auroc_mean": round(statistics.mean(full), 4),
        "cv5_auroc_sd": round(statistics.stdev(full), 4),
        "cv5_auroc_without_top_company_flag": round(statistics.mean(without_top), 4),
        "cv5_auroc_age_only_baseline": round(statistics.mean(age), 4),
    }

    survival = ARTIFACTS / "survival_metrics.json"
    if survival.exists():
        s = json.loads(survival.read_text())
        out["survival"] = {k: s[k] for k in ("n_companies", "dissolved_rate", "auroc",
                                             "auroc_age_only_baseline", "brier", "by_age_band")}

    # Fraud: the isolation forest has no labels to be scored against, so
    # anomalies are injected into held-out profiles and the detector is
    # judged on finding them at a fixed false-positive rate on clean ones.
    from app.core.database import SessionLocal
    from app.ml.features import financial_feature_matrix

    db = SessionLocal()
    try:
        matrix, _, names = financial_feature_matrix(db)
    finally:
        db.close()
    idx = {n_: i for i, n_ in enumerate(names)}
    train, test = train_test_split(matrix, test_size=0.25, random_state=42)
    scaler = StandardScaler().fit(train)
    iso = IsolationForest(n_estimators=250, contamination=0.06, random_state=42, n_jobs=-1)
    iso.fit(scaler.transform(train))

    def anomaly(rows):
        return -iso.score_samples(scaler.transform(rows))

    clean = anomaly(test)
    injections = {
        "revenue inflated 10x": lambda r: (r.__setitem__(idx["log_revenue"], r[idx["log_revenue"]] + np.log(10)),
                                           r.__setitem__(idx["revenue_per_head"], r[idx["revenue_per_head"]] * 10)),
        "revenue 60% above GST turnover": lambda r: r.__setitem__(idx["gst_revenue_deviation"], 0.6),
        "LTV:CAC inflated 8x": lambda r: r.__setitem__(idx["ltv_cac_ratio"], r[idx["ltv_cac_ratio"]] * 8),
        "runway inconsistent with burn (6x)": lambda r: r.__setitem__(idx["runway_months"], r[idx["runway_months"]] * 6),
        "growth claimed at 2000%": lambda r: r.__setitem__(idx["revenue_growth_pct"], 2000.0),
    }
    fraud_rows = {}
    for label, inject in injections.items():
        bad = test.copy()
        for row in bad:
            inject(row)
        scores = anomaly(bad)
        auc = float(roc_auc_score(np.r_[np.zeros(len(clean)), np.ones(len(scores))], np.r_[clean, scores]))
        fraud_rows[label] = {
            "auroc": round(auc, 4),
            **{f"detected_at_fpr_{int(f * 100)}pct": round(float((scores > np.quantile(clean, 1 - f)).mean()), 3)
               for f in (0.01, 0.05, 0.10)},
        }
    out["fraud"] = {
        "data": f"{len(matrix):,} financial profiles; {len(test):,} held out as clean",
        "features": names,
        "injections": fraud_rows,
        "caveat": ("The profiles are modelled from public funding records, not reported, and the GST "
                   "deviation feature is derived from simulated turnover. These rates measure the "
                   "detector's sensitivity to the injected patterns, not real-world fraud detection."),
    }
    return out


# --------------------------------------------------------------------------


def write_companies_csv() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "companies.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["brand", "website", "cin", "registered_name", "incorporated",
                    "registered_state", "registered_city"])
        for brand, site, cin in COMPANIES:
            t = _truth(cin) or {}
            w.writerow([brand, site, cin, t.get("legal_name"), t.get("founded_year"),
                        t.get("hq_state"), t.get("hq_city")])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--collect", action="store_true")
    ap.add_argument("--replay", action="store_true")
    ap.add_argument("--models", action="store_true")
    args = ap.parse_args()
    if not (args.collect or args.replay or args.models):
        args.all = True

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
    write_companies_csv()

    if args.all or args.collect:
        print(f"Collecting: live agent run for {len(COMPANIES)} companies…")
        runs = asyncio.run(collect())
        RUNS_PATH.write_text(json.dumps(runs, indent=1, default=str))
        results["table3_sources"] = table3(runs)
        RESULTS_PATH.write_text(json.dumps(results, indent=2, default=str))
    if args.all or args.replay:
        runs = json.loads(RUNS_PATH.read_text())
        results["table3_sources"] = table3(runs)
        print("Replaying perturbed claim sets…")
        results["table2_verification"] = asyncio.run(replay(runs))
        RESULTS_PATH.write_text(json.dumps(results, indent=2, default=str))
    if args.all or args.models:
        print("Evaluating scoring models…")
        results["table4_models"] = models()

    results["generated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    RESULTS_PATH.write_text(json.dumps(results, indent=2, default=str))
    print(f"\nwrote {RESULTS_PATH}")


if __name__ == "__main__":
    main()
