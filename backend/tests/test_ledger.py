"""The reconciliation rules: how evidence becomes a field status.

These are the rules the whole product rests on, so they are tested directly,
without the network.
"""

from app.onboarding.ledger import reconcile


def ev(source, value, kind="network", **extra):
    return {"source": source, "tool": source, "label": source.title(), "kind": kind,
            "value": value, "note": "", "suggest": True, **extra}


def field(result, key):
    return next(f for f in result["fields"] if f["key"] == key)


BASE = {"stage": "seed", "email": "founder@acme.com"}


class TestStatuses:
    def test_a_live_source_agreeing_verifies_a_claim(self):
        out = reconcile({**BASE, "legal_name": "Acme Robotics"},
                        {"legal_name": [ev("website", "Acme Robotics")]}, {})
        assert field(out, "legal_name")["status"] == "verified"

    def test_a_live_source_disagreeing_is_a_conflict_with_a_suggestion(self):
        out = reconcile({**BASE, "legal_name": "Acme Robotics"},
                        {"legal_name": [ev("website", "Globex Industries")]}, {})
        row = field(out, "legal_name")
        assert row["status"] == "conflict"
        assert row["suggestion"]["value"] == "Globex Industries"
        assert "legal_name" in out["blocking"]

    def test_mock_evidence_alone_never_verifies(self):
        out = reconcile({**BASE, "gstin": "29AAACR5055K1Z3"},
                        {"gstin": [ev("gstn", "29AAACR5055K1Z3", kind="mock")]}, {})
        row = field(out, "gstin")
        assert row["status"] == "claimed"
        assert "not independent proof" in row["note"]

    def test_a_public_dataset_counts_as_independent(self):
        out = reconcile({**BASE, "legal_name": "Acme Robotics"},
                        {"legal_name": [ev("corpus", "Acme Robotics", kind="dataset")]}, {})
        assert field(out, "legal_name")["status"] == "verified"

    def test_agent_filled_values_are_marked_as_such(self):
        out = reconcile(BASE, {"hq_city": [ev("website", "Bengaluru")]}, {})
        row = field(out, "hq_city")
        assert row["status"] == "fetched" and row["origin"] == "agent" and row["value"] == "Bengaluru"

    def test_two_live_sources_agreeing_verifies_an_agent_value(self):
        out = reconcile(BASE, {"hq_city": [ev("website", "Bengaluru"), ev("github_org", "Bangalore")]}, {})
        assert field(out, "hq_city")["status"] == "verified"

    def test_two_live_sources_disagreeing_asks_the_founder(self):
        out = reconcile(BASE, {"hq_city": [ev("website", "Bengaluru"), ev("github_org", "Mumbai")]}, {})
        assert field(out, "hq_city")["status"] == "conflict"

    def test_required_fields_with_nothing_are_missing(self):
        out = reconcile(BASE, {}, {})
        assert field(out, "legal_name")["status"] == "missing"
        assert "legal_name" in out["blocking"]

    def test_a_blocking_local_check_beats_a_mock_agreeing(self):
        """A bad check digit must win over a mocked registry saying fine."""
        evidence = {"gstin": [ev("gstn", "29AAACR5055K1Z9", kind="mock"),
                              ev("gstin_check", None, kind="local", force="disagree",
                                 blocking=True, note="Check digit is 9 but should be 3")]}
        out = reconcile({**BASE, "gstin": "29AAACR5055K1Z9"}, evidence, {})
        row = field(out, "gstin")
        assert row["status"] == "conflict" and "Check digit" in row["note"]


class TestResolutions:
    def test_accepting_a_suggestion_resolves_the_conflict(self):
        evidence = {"founded_year": [ev("website", 2014)]}
        out = reconcile({**BASE, "founded_year": 2021}, evidence, {})
        assert field(out, "founded_year")["status"] == "conflict"

        resolved = reconcile({**BASE, "founded_year": 2021}, evidence,
                             {"founded_year": {"value": 2014, "resolution": "accept"}})
        assert field(resolved, "founded_year")["status"] == "verified"
        assert "founded_year" not in resolved["blocking"]

    def test_keeping_your_own_value_is_allowed_but_recorded(self):
        out = reconcile({**BASE, "founded_year": 2021}, {"founded_year": [ev("website", 2014)]},
                        {"founded_year": {"value": 2021, "resolution": "keep"}})
        row = field(out, "founded_year")
        assert row["status"] == "disputed"
        assert "founded_year" not in out["blocking"], "disputed does not block submission"

    def test_preferred_evidence_wins_the_value(self):
        """The registry is authoritative for a registered name."""
        evidence = {"legal_name": [ev("website", "Zerodha"),
                                   ev("mca21", "Zerodha Broking Limited", kind="dataset", prefer=True)]}
        out = reconcile(BASE, evidence, {})
        assert field(out, "legal_name")["value"] == "Zerodha Broking Limited"


class TestStageRules:
    def test_idea_stage_is_not_asked_for_financials(self):
        out = reconcile({**BASE, "stage": "idea"}, {}, {})
        assert not [f for f in out["fields"] if f["group"] == "Financials"]

    def test_seed_stage_must_supply_burn_and_cash(self):
        out = reconcile(BASE, {}, {})
        assert {"burn_rate_monthly", "cash_balance"} <= set(out["blocking"])

    def test_website_is_optional_so_a_pre_launch_company_can_register(self):
        out = reconcile({**BASE, "legal_name": "Stealth Co"}, {}, {})
        assert "website" not in out["blocking"]


def test_an_independent_source_that_disagrees_is_never_outvoted():
    """One agreeing source must not hide another that disagrees.

    The founder's own website agreeing with their claim is the weakest
    evidence there is; the registry contradicting it is the strongest. The
    result has to be a conflict a person resolves, naming both sides.
    """
    from app.onboarding.ledger import reconcile

    evidence = {"founded_year": [
        {"source": "website", "tool": "website", "label": "Company website",
         "kind": "network", "value": 2010, "note": ""},
        {"source": "mca21", "tool": "mca21", "label": "MCA registry",
         "kind": "dataset", "value": 2018, "note": "Incorporated 2018-09-25", "prefer": True},
    ]}
    row = next(f for f in reconcile({"founded_year": 2010, "stage": "seed"}, evidence, {})["fields"]
               if f["key"] == "founded_year")
    assert row["status"] == "conflict"
    assert row["suggestion"]["value"] == 2018
    assert "Company website agrees" in row["note"] and "MCA registry does not" in row["note"]


def test_the_authoritative_source_settles_a_brand_name():
    """A company trading under a brand must not be flagged for giving its
    registered name: the registry is the authority for that field."""
    from app.onboarding.ledger import reconcile

    evidence = {"legal_name": [
        {"source": "website", "tool": "website", "label": "Company website",
         "kind": "network", "value": "Mamaearth", "note": ""},
        {"source": "mca21", "tool": "mca21", "label": "MCA registry",
         "kind": "dataset", "value": "Honasa Consumer Limited", "note": "", "prefer": True},
    ]}
    row = next(f for f in reconcile({"legal_name": "Honasa Consumer Limited", "stage": "seed"},
                                    evidence, {})["fields"] if f["key"] == "legal_name")
    assert row["status"] == "verified"
    assert "Mamaearth" in row["note"], "the website's dissent should still be visible"


def test_without_an_authority_a_contradiction_goes_to_a_person():
    from app.onboarding.ledger import reconcile

    evidence = {"hq_city": [
        {"source": "github_org", "tool": "github_org", "label": "GitHub", "kind": "network",
         "value": "Bengaluru", "note": ""},
        {"source": "mca21", "tool": "mca21", "label": "MCA registry", "kind": "dataset",
         "value": "Mumbai", "note": "Registered office city"},
    ]}
    row = next(f for f in reconcile({"hq_city": "Bengaluru", "stage": "seed"}, evidence, {})["fields"]
               if f["key"] == "hq_city")
    assert row["status"] == "conflict"
