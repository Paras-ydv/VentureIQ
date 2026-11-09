# VentureIQ — evaluation results and method details for the KEIS paper

Results for Tables 2–4 of `VentureIQ_KEIS_draft.docx`, answers to the open method
questions, and the statements in the draft that do not match the implementation.
Generated 9 November 2026 by `backend/scripts/evaluate.py`; raw results in
`docs/evaluation/results.json`, the company list in `docs/evaluation/companies.csv`.

**Headline, for the abstract placeholder:** *On 42 Indian companies, conflict
detection reached precision 1.00 and recall 1.00 for company name and incorporation
date, and median end-to-end verification time was 5.4 s.* Registered-office city
and state are weaker (precision 0.77 and 0.88), for a reason explained under Table 2.

---

## 1. Method details requested

### 1.1 Matching rule for each field type

Values are normalised before comparison: lower-cased, legal suffixes removed
(private, pvt, limited, ltd, llp, inc, incorporated, llc, corp, corporation, co,
gmbh, plc) and all non-alphanumeric characters dropped.

| Field | Rule | Tolerance |
|---|---|---|
| Company name | equal after normalisation; or one contains the other (both ≥ 4 characters); or `difflib.SequenceMatcher` ratio ≥ 0.85 | fuzzy, t = 0.85 |
| Incorporation / founding year | absolute difference | ±1 year |
| Domain age vs founding year | conflict if the domain was registered more than 2 years *after* the claimed founding; agree if registered no more than 3 years before; otherwise no verdict (an older domain proves nothing) | one-sided |
| City | equal after alias canonicalisation (Bangalore ≡ Bengaluru, Gurgaon ≡ Gurugram, …) | aliases |
| State | equal after normalisation | exact |
| Headcount, active users | ratio of the larger to the smaller | ≤ 2× |
| Revenue, burn, cash, capital | relative difference from the claim | ≤ 20% |
| Website | registrable domain equal | exact |
| CIN, GSTIN, email, stage, sector, GitHub org, LinkedIn/X URL | equal after normalisation | exact |
| One-liner, description, sub-vertical | not compared (free text) | — |

The CIN is also decoded for format (state, year, company type) and the GSTIN check
digit is validated; a failed check digit is a blocking conflict.

**From per-source verdicts to a label.** Only *independent* evidence can verify a
field: a live lookup (website, RDAP, DNS, GitHub, MCA, GST, LinkedIn) or a public
dataset. Local computations (check digits, CIN decoding, the sector classifier,
city→state) and mocked sources can support a value or raise a warning, never
verify it. When independent sources disagree with each other, an **authoritative**
source for the field settles it. The MCA registry is authoritative for the
registered name and the incorporation date. Without an authoritative source, any
independent disagreement makes the field *conflicted*.

Labels: *verified*, *auto-filled* (founder left it empty, a source supplied it),
*founder's input* (claimed, no independent source could check it) and *conflicted*.
A conflicted field the founder chooses to keep becomes *disputed* and is flagged for
review. The draft names three labels; there are four.

### 1.2 Growth model: data and outcome

Gradient-boosting classifier (scikit-learn; 300 trees, learning rate 0.05, depth 3,
subsample 0.85) trained on **1,896 Y Combinator companies** from the yc-oss/api
directory.

- **Outcome:** binary — *acquired or public* (830) versus *inactive* (1,066). The
  4,255 companies still active are excluded, because their outcome is unresolved.
- **Features:** team size; years since the YC batch; number of tags; description
  length; YC's "top company" flag; one-hot industry, region and YC stage; and the
  company description as TF-IDF (1–2-grams, 6,000 terms) reduced by truncated SVD
  to 96 dimensions.
- **Split:** 22% stratified hold-out, seed 42.

It is global YC data applied to Indian startups — a domain transfer, and the paper
should say so.

### 1.3 Risk and founder-credibility models: exact inputs and weights

Both are additive and clamped to [0, 100]. `clamp(x, a, b)` bounds a term to [a, b].

**Risk** (reported as *safety*: higher is safer), base **60**:

| Input | Term |
|---|---|
| Runway *r* months (cash ÷ monthly burn) | + clamp(2(*r* − 12), −30, +22); **−8** if no runway is known |
| Monthly burn per employee *b* (USD) | + clamp((8000 − *b*)/400, −18, +12) |
| Competitive density *d* (companies in the same sector and stage; only when the cohort has ≥ 20) | + clamp(−(*d* − 30)/8, −12, +6) |
| Company younger than one year | **−6** |
| MCA survival model's dissolution probability *p* (only when the CIN is matched in the register) | + clamp(40(0.275 − *p*), −14, +10) |

**Founder credibility**, base **42** (a company with no founder data scores 25):

| Input | Term |
|---|---|
| Most prior exits on the team *e* | + clamp(14*e*, 0, 28) |
| Most years of domain experience *y* | + clamp(1.6*y*, 0, 20) |
| Team's public GitHub commits in 90 days *c* | + clamp(2.6 ln(1 + *c*), 0, 14) |
| Share of founders with a public LinkedIn or GitHub profile *v* | + clamp(18(*v* − 0.5), −9, +9) |
| Solo founder | **−5** |

Composite = 0.35 growth + 0.25 safety + 0.25 founder + 0.15 (100 − fraud).

**Important for the paper:** for the 9,287 seeded corpus companies, the founder
inputs (exits, experience, commits) and the runway and burn are *modelled*, not
collected. Only companies registered through the agent have founder-supplied or
verified inputs. The profile pages label this.

### 1.4 Are the retries and the 30-day cache implemented?

**Yes, but not in the loop the paper describes.** There are two agents in the code:

| | Registration agent (the loop in Fig. 2, streamed to the founder) | Enrichment agent ("Run verification agent" on an existing profile) |
|---|---|---|
| Retries | **None.** Each source has a 20 s timeout; a failure is logged and the agent continues without it | **Yes:** up to 5 attempts, exponential backoff of min(0.25·2ⁿ, 4) s |
| 30-day cache | **No** for website, RDAP, DNS and GitHub (fresh each run) | **Yes:** results younger than 30 days are reused |

Separately: LinkedIn lookups are cached for 90 days under a 45-call monthly budget;
GST lookups are cached without expiry; the MCA register is read from a local bulk
import of the data.gov.in dataset (3.67 million companies), with the live API as a
fallback for a CIN not found locally.

This matters in the results. The two corrupted CINs the system failed to catch
(Table 2) were both cases where that live fallback timed out and was not retried.
Either implement retries in the registration loop, or change the sentence in §4.2
and contribution 1) of the introduction.

---

## 2. Results

### Protocol as run

- **Companies.** 42 Indian companies with a public website and an Active entity in
  the MCA register, from Flipkart and Paytm to Hasura and Fyle. Brand names rarely
  match legal names (CRED is Dreamplug Technologies, Mamaearth is Honasa Consumer),
  so every brand→entity mapping is listed in `companies.csv`.
- **Ground truth.** The MCA Company Master Data record for each CIN: registered
  name, incorporation date, registered-office state and city. **This was not
  re-checked by hand on the MCA portal.** If the paper says "checked manually", hand-
  verify at least a sample (10 of the 42 would be reasonable) and say how many.
- **Collection.** The registration agent ran once per company, live, with what a
  founder would enter: website, work email, name, stage, registered name and CIN.
  Every source call was timed (Table 3).
- **Perturbation.** Against the evidence each run gathered, we replayed the correct
  claim set and one-field perturbations (*k* = 1), kept outside the system's
  tolerances: another company's registered name, incorporation year ±4, a city and
  a state in a different state. For CINs, another company's real CIN and a CIN with
  one digit changed were each run back through the real registry lookup, because a
  different CIN changes what the registry returns.
- **Scoring.** A field is *flagged* when it comes out conflicted. Positives are the
  perturbed claims for a field; negatives are its correct claims.

### Table 2. Verification per field (42 companies)

| Field | Source | Coverage (%) | Precision | Recall |
|---|---|---|---|---|
| Company name | MCA, website | 100 | 1.00 | 1.00 (42/42) |
| Incorporation date | MCA | 100 | 1.00 | 1.00 (84/84) |
| Registered address — city | MCA | 100 | 0.77 | 1.00 (41/41) |
| Registered address — state | MCA | 100 | 0.88 | 1.00 (42/42) |
| CIN — another company's | MCA | 100 | — | 1.00 (42/42) |
| CIN — one digit changed | MCA | 100 | — | 0.95 (40/42) |
| Domain age | RDAP | 95 | — | backdating: 0.50 (21/42); postdating: 0 by design |
| ~~Directors~~ | — | not available | | |
| GSTIN status | GST | not measured | | |
| Founder history | LinkedIn | not measured | | |

95% Clopper–Pearson intervals: name recall [0.92, 1.00]; incorporation-date recall
[0.96, 1.00]; name false-positive rate [0, 0.08]; city false-positive rate
[0.16, 0.46]; corrupted-CIN detection [0.84, 0.99]. On 42 companies, a perfect score
means "at least about 92%", not "always".

**Reading the table.**

- *Coverage is an upper bound.* Every company was registered and its CIN was
  supplied, so the registry always answered. A founder who gives only a name relies
  on fuzzy name search.
- *City and state precision is a definition problem, not a detection problem.* All
  18 false flags on correct claims are city or state. In 15 the website gave the
  company's operating headquarters, and in 3 GitHub did, where the register gives
  the registered office. Mamaearth's registered office is in Delhi; it operates from
  Gurugram. Neither source is wrong; the profile has one field for two addresses.
  Splitting it into *registered office* and *headquarters* would remove these. Worth a
  sentence in §6.
- *A swapped CIN is never caught on the CIN itself* — the registry confirms that CIN
  exists. It is caught because the registered name no longer matches (all 42), and
  usually the date and state too. This is cross-field consistency doing its job.
- *The two corrupted-CIN misses* (Flipkart, InMobi) are source failures, not
  reasoning failures: the live registry fallback timed out (see §1.4).
- *Domain age* catches only backdating — a company claiming to be older than its
  domain. A domain older than the company is normal, so the rule deliberately gives
  no verdict for postdating.
- *Tolerance check:* a two-letter swap in the registered name was accepted in 40 of
  42 cases, as intended by the 0.85 fuzzy threshold.
- *Directors* are not in the MCA master data that data.gov.in publishes; that row
  should be removed (and from Table 1). *GSTIN status* needs a GSTIN for each
  company, which only a founder supplies; *founder history* needs each founder's
  LinkedIn URL and is limited to 45 lookups a month. Neither was exercised.

**Reconciliation-rule ablation.** The same evidence, scored under three rules:

| Field | Original: any agreeing source outvotes any disagreeing one | Any disagreement is a conflict | **Implemented:** authoritative source decides, else any disagreement |
|---|---|---|---|
| Company name | P 1.00 / R 1.00 | P 0.69 / R 1.00 | **P 1.00 / R 1.00** |
| Incorporation date | P 1.00 / **R 0.71** | P 0.89 / R 1.00 | **P 1.00 / R 1.00** |
| City | P 1.00 / R 1.00 | P 0.77 / R 1.00 | P 0.77 / R 1.00 |
| State | P 1.00 / R 1.00 | P 0.88 / R 1.00 | P 0.88 / R 1.00 |
| CIN, one digit changed | 0.93 caught | 0.95 | 0.95 |

The original rule, which was in the code until this evaluation, missed **24 of 84**
falsified incorporation dates. In 16 of them a domain registered near the claimed
year, and in 9 a GitHub organisation created near it, "agreed" and outvoted the
official incorporation record (some had both). "Any disagreement" fixes that but
flags 45% of correct registered names, because companies trade under brands. The
implemented rule keeps the registry authoritative for the fields it is authoritative
for. Its incorporation-date recall interval, [0.96, 1.00], does not overlap the
original's, [0.61, 0.81].

### Table 3. Source coverage and latency (42 live runs)

| Source | Calls | Usable response (%) | Median latency (s) | p95 latency (s) |
|---|---|---|---|---|
| Company website | 42 | 88.1 | 1.46 | 4.09 |
| RDAP | 42 | 95.2 | 1.29 | 3.26 |
| DNS (website) | 42 | 100 | 0.16 | 0.32 |
| DNS (email MX) | 42 | 100 | 0.14 | 0.21 |
| GitHub REST API | 37 | 35.1 (answered 100) | 0.75 | 5.29 |
| MCA (local copy of data.gov.in master data) | 42 | 100 | < 0.01 | < 0.01 |
| GST public register | 0 | not exercised | — | — |
| LinkedIn | 0 | not exercised | — | — |
| **End-to-end per startup** | 42 | 100 completed | **5.38** | **11.83** |

- *Website failures (5):* HTTP 403 bot protection (Swiggy, Meesho, Lenskart), one
  unreadable response (MakeMyTrip), and **Zomato, whose robots.txt asks automated
  agents not to read the page — the agent complied.** That last one is worth stating;
  it is a design choice, not a fault.
- *RDAP failures (2):* hasura.io and wakefit.co — the `.io` and `.co` registries do
  not publish RDAP.
- *GitHub* always answered; it found an organisation that lists the company's own
  domain as its website for 13 of 37 companies. It ran for 37 rather than 42 because
  the GitHub lookup is planned from what the website yields: the five companies whose
  site could not be read never reached it. A blocked website therefore costs more
  than one source.
- *MCA* was answered from the local copy in every case, which is why it is fast. A
  live data.gov.in lookup, used only for a CIN absent locally, timed out in 3 of the
  42 corrupted-CIN lookups.
- *Not reported:* the company-page LinkedIn lookup is a **mocked** adapter in this
  build and was excluded; the founder-profile lookup (real, via a third-party API)
  needs founder URLs. Sources run sequentially, so end-to-end time is the sum of the
  calls.

### Table 4. Scoring-model performance

| Model | Data / protocol | Metric | Value |
|---|---|---|---|
| Growth (gradient boosting) | 1,896 YC companies; 5-fold stratified CV | ROC-AUC | **0.735 ± 0.009** (22% hold-out: 0.741) |
| Fraud (isolation forest) | 8,512 financial profiles, 2,128 held out as clean; anomalies injected into the held-out set | Detection rate at FPR 5% | **8–17%** by anomaly type |
| *Survival (histogram gradient boosting) — suggested addition* | 1,193,843 MCA companies, 27.5% struck off or dissolved; 20% stratified hold-out | ROC-AUC | **0.904** |

*Growth, further checks.* Logistic regression 0.721 and random forest 0.732 on the
same hold-out. Age alone scores 0.530, so the model is not reading company age.
Removing YC's "top company" flag — awarded on outcomes, so close to a label leak —
costs only 0.005 (0.730).

*Fraud, by anomaly type* (ROC-AUC; detection at FPR 1% / 5% / 10%):

| Injected anomaly | ROC-AUC | 1% | 5% | 10% |
|---|---|---|---|---|
| Revenue inflated 10× | 0.56 | 0.02 | 0.08 | 0.14 |
| Revenue 60% above GST turnover | 0.88 | 0.02 | 0.12 | 0.32 |
| LTV:CAC inflated 8× | 0.90 | 0.02 | 0.17 | 0.52 |
| Runway inconsistent with burn (6×) | 0.73 | 0.02 | 0.11 | 0.23 |
| Growth claimed at 2,000% | 0.73 | 0.01 | 0.08 | 0.15 |

**The isolation forest alone is weak, and the paper should say so plainly.** A 10×
revenue inflation is almost invisible, because the population's revenue range is so
wide that a bigger number just looks like a bigger company. Unsupervised outlier
detection cannot catch a claim that is inflated but plausible; only a cross-source
check, such as reconciling revenue with GST turnover, can. Two further caveats:
the profiles are modelled from public funding records rather than reported, and the
GST-deviation feature is derived from simulated turnover. These rates measure the
detector's sensitivity to the injected patterns, not real-world fraud detection.
The production fraud score also includes deterministic rules (for example on LTV:CAC
and revenue per employee) that this table does not credit.

*Survival, why add it.* It is the only model trained on Indian outcomes, from an
official source, at scale: 1.19 million companies against the growth model's 1,896.
Age alone scores 0.830; within age bands the model scores 0.71–0.90, so it is not
merely reading a clock. It predicts corporate dissolution, not startup failure, and
already feeds the risk score (§1.3).

---

## 3. Statements in the draft that do not match the implementation

| Where | Draft says | Implementation |
|---|---|---|
| Abstract, §4.1 | four mandatory inputs: website, email, company name, stage | required: work email, founder's name, stage, and *either* website *or* company name |
| §4.1 | validated in the browser with Zod schemas | Zod is not used; the browser uses HTML constraint validation and hand-written checks. Server-side Pydantic is correct |
| Abstract, §4.1, Fig. 2 | three labels: verified, auto-filled, conflicted | four — add *founder's input* (claimed, unverifiable) |
| §4.2, contribution 1) | exponential backoff, five retries, cached fallback ≤ 30 days | true of the enrichment agent only; the registration loop has neither (§1.4) |
| §4.2 | selects the next source "most likely to resolve the remaining fields" | a rule-based planner adds sources to a sequential queue in reaction to earlier results; there is no likelihood estimate |
| Table 1 | MCA supplies directors | not in the master data; remove |
| Table 1, Intro | GST supplies return-filing status | the API tier in use returns registration status only; filing history needs a paid tier |
| §4.3, §4.4 | conflicts are passed to the fraud model; the isolation forest uses "the number and type of conflicted fields" | the isolation forest uses ten financial ratios only; conflicts are not features |
| §4.4 | risk uses "a sector regulatory flag" | no such input (§1.3) |
| §4.4 | founder credibility uses "verified employment history" | not an input; employment history is stored but not scored |
| §4.4, Eq. (2) | rule-model attributions are exact Shapley values, *w*ᵢ[*g*ᵢ(*x*ᵢ) − E *g*ᵢ(*X*ᵢ)] | the code reports *w*ᵢ*g*ᵢ(*x*ᵢ) against a fixed "input absent" reference, not centred on the population mean. It is an exact additive decomposition, but not Shapley values relative to the data distribution. Reword Eq. (2), or we centre the terms in code |
| §4.4 | risk is a pure additive rule model | it now includes the MCA survival model's probability as one term |
| §4.5 | MCA records come from the data.gov.in API | from a local bulk import of the data.gov.in dataset; the live API is a fallback |
| §4.5 | frontend hosted on Vercel | deployment is configured; confirm a live URL before stating it |
| Abstract | only the resolved profile reaches the scoring models | true for registrations; the 9,287 seeded companies are scored without verification, on modelled financials |
| — (missing) | | **The agent uses no language model.** Given "Agentic AI" in the keywords and a related-work section on agentic language-model systems, say so explicitly — it is a strength: nothing in the verification path can hallucinate |

§4.3 should also describe the authority rule from §1.1 — one sentence is enough.

---

## 4. Reproducing

```bash
cd backend
.venv/bin/python scripts/evaluate.py --all       # ~5 min; live network calls
.venv/bin/python scripts/evaluate.py --replay    # Table 2 again from saved runs, offline
.venv/bin/python scripts/evaluate.py --models    # Table 4 only
```

The live run (Table 3) depends on the day: sites change, rate limits vary, and the
three registry timeouts may not recur. The replay and model numbers are
deterministic given `docs/evaluation/agent_runs.json`.
