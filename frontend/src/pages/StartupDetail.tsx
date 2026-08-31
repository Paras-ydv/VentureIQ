import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type Benchmark,
  type StartupDetail as Detail,
  type StartupSummary,
} from "../lib/api";
import {
  compactNum,
  compactUsd,
  fraudBand,
  relativeTime,
  scoreBand,
  SEVERITY_COLOR,
  stageLabel,
  titleCase,
} from "../lib/format";
import { AttributionBars } from "../components/charts";
import {
  Badge,
  Card,
  Empty,
  ProvenanceDot,
  ScoreRing,
  SectionHeader,
  SkeletonRows,
  Spinner,
} from "../components/primitives";
import { useInvestor } from "../lib/investor-context";

const DIMENSIONS = [
  { key: "growth_potential", label: "Growth potential", scoreKey: "growth_potential_score" },
  { key: "risk_level", label: "Safety / risk", scoreKey: "risk_level_score" },
  { key: "founder_credibility", label: "Founder credibility", scoreKey: "founder_credibility_score" },
  { key: "fraud_likelihood", label: "Fraud likelihood", scoreKey: "fraud_likelihood_score" },
] as const;

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="py-2.5">
      <div className="text-[11px] text-ink-faint mb-1">{label}</div>
      <div
        className="tnum text-[15px] font-medium"
        style={{ color: tone ?? "var(--color-ink)" }}
      >
        {value}
      </div>
      {hint && <div className="text-[10.5px] text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export default function StartupDetail() {
  const { id } = useParams<{ id: string }>();
  const { track } = useInvestor();
  const [s, setS] = useState<Detail | null>(null);
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [similar, setSimilar] = useState<StartupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [trace, setTrace] = useState<any>(null);
  const [activeDim, setActiveDim] = useState<string>("growth_potential");
  const enteredAt = useRef(Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await api.startup(id);
      setS(d);
      api.benchmark(id).then(setBench).catch(() => {});
      api.similar(id, 4).then(setSimilar).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Dwell time is one of the implicit-feedback signals the matching engine
  // learns from, so it is reported on unmount rather than on open.
  useEffect(() => {
    enteredAt.current = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - enteredAt.current) / 1000);
      if (id && seconds >= 3) track("time_spent", id, { seconds });
    };
  }, [id, track]);

  async function runEnrichment() {
    if (!id) return;
    setEnriching(true);
    try {
      const res = await api.enrich(id, true);
      setTrace(res.trace);
      await load();
    } catch (e) {
      setTrace({ error: String(e) });
    } finally {
      setEnriching(false);
    }
  }

  if (loading && !s) return <SkeletonRows n={4} height={120} />;
  if (!s) return <Card><Empty title="Startup not found" /></Card>;

  const score = s.score;
  const band = scoreBand(score?.composite_score ?? null);

  const fin = s.financials;
  const attribution = score?.shap_top_features?.[activeDim];
  const gstGap =
    fin?.revenue && fin?.gst_reported_revenue
      ? Math.abs(fin.revenue - fin.gst_reported_revenue) / fin.revenue
      : null;

  return (
    <div className="space-y-5 animate-in">
      <Link to="/discover" className="text-[12.5px] text-ink-muted hover:text-ink transition-colors">
        ← Back to discover
      </Link>

      {/* ------------------------------------------------------------ hero */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
                {s.legal_name}
              </h1>
              {s.verified ? (
                <Badge tone="good">Registry-verified</Badge>
              ) : (
                <Badge tone="warning">Unverified</Badge>
              )}
              {s.status && <Badge tone="neutral">{titleCase(s.status)}</Badge>}
            </div>

            {/* Imported descriptions run to several hundred words; clamped so
                the hero never pushes the scores below the fold. */}
            <p className="text-[13.5px] text-ink-secondary mt-2.5 max-w-2xl leading-relaxed line-clamp-5">
              {s.long_description ?? s.one_liner ?? "No description provided."}
            </p>

            <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
              <span className="chip">{s.sector}</span>
              <span className="chip">{stageLabel(s.stage)}</span>
              {s.hq_city && (
                <span className="chip">
                  {s.hq_city}
                  {s.hq_state ? `, ${s.hq_state}` : ""}
                </span>
              )}
              {s.founded_date && <span className="chip">Founded {s.founded_date.slice(0, 4)}</span>}
              {s.employee_count && <span className="chip">{s.employee_count} employees</span>}
              {s.website && (
                <a
                  href={s.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="chip hover:border-line-strong transition-colors"
                >
                  Website ↗
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button className="btn btn-primary" onClick={runEnrichment} disabled={enriching}>
                {enriching ? "Running agent…" : "Run verification agent"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  track("save", s.startup_id);
                  track("interest_expressed", s.startup_id);
                }}
              >
                Express interest
              </button>
              <button className="btn" onClick={() => track("dismiss", s.startup_id)}>
                Dismiss
              </button>
            </div>
          </div>

          <div className="text-center shrink-0">
            <div
              className="tnum text-[52px] font-semibold leading-none tracking-tight"
              style={{ color: band.color }}
            >
              {score ? Math.round(score.composite_score) : "—"}
            </div>
            <div className="eyebrow mt-2">Composite · {band.label}</div>
            {score && (
              <div className="text-[10.5px] text-ink-faint mt-1.5 max-w-[150px]">
                {score.confidence === "low" ? "Low-confidence cohort" : "High-confidence cohort"}
                {score.cohort_size ? ` · n=${score.cohort_size}` : ""}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ scores + rationale */}
      {score && (
        <Card className="p-5">
          <SectionHeader
            eyebrow="AI engine"
            title="Four independent scores"
            description="Computed separately, not as one fused model — combining these dimensions too early measurably degrades accuracy. Select a dimension to see what drove it."
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {DIMENSIONS.map((d) => {
              const val = score[d.scoreKey] as number;
              const isFraud = d.key === "fraud_likelihood";
              const color = isFraud ? fraudBand(val).color : scoreBand(val).color;
              const active = activeDim === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setActiveDim(d.key)}
                  className={`card interactive p-3.5 flex flex-col items-center gap-2 ${
                    active ? "!border-[color:var(--color-brand-dim)] !bg-raised" : ""
                  }`}
                >
                  <ScoreRing value={val} size={62} color={color} />
                  <span
                    className={`text-[11.5px] font-medium text-center leading-tight ${
                      active ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    {d.label}
                  </span>
                  {isFraud && (
                    <span className="text-[9.5px] text-ink-faint">higher = worse</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-5 border-t border-line pt-5">
            <div>
              <div className="eyebrow mb-2.5">
                Top contributing features
                {attribution?.method && (
                  <span className="ml-2 normal-case tracking-normal text-ink-faint font-normal">
                    via {attribution.method.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {attribution?.features?.length ? (
                <AttributionBars items={attribution.features} />
              ) : (
                <p className="text-[12.5px] text-ink-muted">No attributions recorded.</p>
              )}
            </div>

            <div>
              <div className="eyebrow mb-2.5">Plain-English rationale</div>
              <p className="text-[13px] text-ink-secondary leading-relaxed">
                {score.rationale?.[activeDim] ?? "—"}
              </p>
              <div className="mt-4 pt-4 border-t border-line">
                <div className="eyebrow mb-2">Composite</div>
                <p className="text-[12.5px] text-ink-muted leading-relaxed">
                  {score.rationale?.composite}
                </p>
                <p className="text-[11px] text-ink-faint mt-3">
                  Model {score.model_version} · scored {relativeTime(score.computed_at)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* -------------------------------------------------------- financials */}
        <Card className="p-5 lg:col-span-2">
          <SectionHeader eyebrow="Financials" title="Reported metrics" />
          {fin ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 divide-y-0">
                <Metric label="Revenue" value={compactUsd(fin.revenue)} />
                <Metric
                  label="YoY growth"
                  value={fin.revenue_growth_pct ? `${fin.revenue_growth_pct.toFixed(0)}%` : "—"}
                  tone={
                    (fin.revenue_growth_pct ?? 0) > 0 ? "var(--color-good)" : undefined
                  }
                />
                <Metric label="Monthly burn" value={compactUsd(fin.burn_rate_monthly)} />
                <Metric
                  label="Runway"
                  value={fin.runway_months ? `${fin.runway_months.toFixed(0)} mo` : "—"}
                  tone={
                    fin.runway_months && fin.runway_months < 12
                      ? "var(--color-warning)"
                      : undefined
                  }
                  hint={fin.runway_months && fin.runway_months < 12 ? "below 12mo" : undefined}
                />
                <Metric label="Cash balance" value={compactUsd(fin.cash_balance)} />
                <Metric
                  label="LTV : CAC"
                  value={fin.ltv_cac_ratio ? `${fin.ltv_cac_ratio.toFixed(1)}x` : "—"}
                  tone={
                    fin.ltv_cac_ratio && fin.ltv_cac_ratio >= 3 ? "var(--color-good)" : undefined
                  }
                  hint="3.0x benchmark"
                />
                <Metric label="TAM" value={compactUsd(fin.tam_usd)} />
                <Metric label="Total raised" value={compactUsd(fin.total_funding_usd)} />
              </div>

              {gstGap !== null && (
                <div
                  className="mt-4 rounded-lg border p-3.5"
                  style={{
                    borderColor:
                      gstGap > 0.2 ? "rgba(208,59,59,0.32)" : "rgba(12,163,12,0.26)",
                    backgroundColor:
                      gstGap > 0.2 ? "rgba(208,59,59,0.07)" : "rgba(12,163,12,0.06)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        color: gstGap > 0.2 ? "var(--color-critical)" : "var(--color-good)",
                      }}
                    >
                      {gstGap > 0.2 ? "Revenue mismatch" : "Revenue corroborated"}
                    </span>
                    <ProvenanceDot isMock />
                  </div>
                  <p className="text-[12.5px] text-ink-secondary leading-relaxed">
                    Founder reports {compactUsd(fin.revenue)}; GST filings show{" "}
                    {compactUsd(fin.gst_reported_revenue)} — a{" "}
                    <span className="tnum">{(gstGap * 100).toFixed(0)}%</span> gap
                    {gstGap > 0.2
                      ? ", above the 20% threshold that triggers a fraud flag."
                      : ", within tolerance."}
                  </p>
                </div>
              )}
            </>
          ) : (
            <Empty title="No financials on record" />
          )}
        </Card>

        {/* ------------------------------------------------------------ founders */}
        <Card className="p-5">
          <SectionHeader eyebrow="Team" title={`Founders (${s.founders.length})`} />
          {s.founders.length ? (
            <div className="space-y-3.5">
              {s.founders.map((f) => (
                <div key={f.founder_id} className="pb-3.5 border-b border-line last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{f.name}</span>
                    <span className="text-[11px] text-ink-muted shrink-0">{f.role}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {f.prior_exits !== null && f.prior_exits > 0 && (
                      <Badge tone="good">
                        {f.prior_exits} prior exit{f.prior_exits > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {f.domain_experience_years !== null && (
                      <span className="chip">{f.domain_experience_years.toFixed(0)}y domain</span>
                    )}
                    {f.github_commit_count_90d ? (
                      <span className="chip">{compactNum(f.github_commit_count_90d)} commits</span>
                    ) : null}
                    {f.github_followers ? (
                      <span className="chip">{compactNum(f.github_followers)} followers</span>
                    ) : null}
                  </div>
                  <div className="flex gap-3 mt-2">
                    {f.linkedin_url && (
                      <a
                        href={f.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-[color:var(--color-brand)] hover:underline"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                    {f.github_username && (
                      <a
                        href={`https://github.com/${f.github_username}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-[color:var(--color-brand)] hover:underline"
                      >
                        GitHub ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No founder profiles"
              hint="Run the verification agent to attach and enrich founder records."
            />
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------- fraud + provenance */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionHeader
            eyebrow="Fraud detection"
            title="Signals raised"
            description="Unsupervised detectors plus deterministic cross-source rules. Nothing here is an automated rejection — flagged profiles escalate to human review."
          />
          {s.fraud_signals.length ? (
            <div className="space-y-3">
              {s.fraud_signals.map((sig) => (
                <div
                  key={sig.signal_id}
                  className="rounded-lg border border-line bg-plane p-3.5"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: SEVERITY_COLOR[sig.severity] }}
                    />
                    <span className="text-[12px] font-medium text-ink">
                      {titleCase(sig.detector)}
                    </span>
                    <Badge tone={sig.severity === "high" ? "critical" : "warning"}>
                      {sig.severity}
                    </Badge>
                    <span className="tnum text-[11px] text-ink-muted ml-auto">
                      score {sig.anomaly_score.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-ink-secondary leading-relaxed">
                    {sig.explanation}
                  </p>
                  {sig.flagged_fields?.length ? (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {sig.flagged_fields.map((f) => (
                        <span key={f} className="chip text-[10.5px]">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 py-6">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="var(--color-good)" strokeWidth="1.6" />
                <path
                  d="M9 12l2 2 4-4"
                  stroke="var(--color-good)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[13px] text-ink-secondary">
                All cross-source consistency checks passed
              </span>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeader
            eyebrow="Agentic enrichment"
            title="Source provenance"
            description="Which external sources were queried, and whether each is a live integration or a mocked stand-in."
          />

          {trace && (
            <div className="mb-4 rounded-lg border border-[color:var(--color-brand-dim)] bg-[rgba(91,157,240,0.06)] p-3.5">
              <div className="eyebrow mb-2 text-[color:var(--color-brand)]">Agent trace</div>
              <p className="text-[12px] text-ink-secondary">
                Planned: {trace.planned?.join(" → ") || "nothing (all cached)"}
              </p>
              {trace.escalations?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {trace.escalations.map((e: any, i: number) => (
                    <p key={i} className="text-[11.5px] text-[color:var(--color-warning)]">
                      ⚠ {e.detail} → {e.action}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {enriching && <Spinner label="Agent querying sources…" />}

          {s.enrichments.length ? (
            <div className="space-y-2">
              {s.enrichments.map((e) => (
                <div
                  key={e.enrichment_id}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-plane px-3 py-2.5"
                >
                  <ProvenanceDot isMock={e.is_mock} />
                  <span className="text-[12.5px] font-medium text-ink w-20 shrink-0">
                    {e.source.toUpperCase()}
                  </span>
                  <span className="text-[11.5px] text-ink-muted flex-1 truncate">
                    {e.is_mock
                      ? (e.raw_response?._why_mock ?? "mocked source")
                      : "live API call"}
                  </span>
                  <Badge tone={e.status === "success" ? "good" : "critical"}>{e.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No enrichment yet"
              hint="Run the verification agent to cross-check this profile against external registries."
            />
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------ benchmark */}
      {bench && (
        <Card className="p-5">
          <SectionHeader
            eyebrow="RAG benchmarking"
            title="Peer comparison"
            description={bench.narrative}
            action={
              <Badge tone={bench.confidence === "high" ? "good" : "warning"}>
                {bench.confidence} confidence
              </Badge>
            }
          />
          {bench.peers.length ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12.5px] min-w-[520px]">
                <thead>
                  <tr className="text-ink-faint text-[11px] uppercase tracking-wide">
                    <th className="text-left font-medium py-2 px-1">Peer</th>
                    <th className="text-left font-medium py-2 px-1">Stage</th>
                    <th className="text-right font-medium py-2 px-1">Similarity</th>
                    <th className="text-right font-medium py-2 px-1">Composite</th>
                    <th className="text-right font-medium py-2 px-1">Raised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {bench.peers.map((p) => (
                    <tr key={p.startup_id} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2.5 px-1">
                        <Link
                          to={`/startup/${p.startup_id}`}
                          className="text-ink hover:text-[color:var(--color-brand)] transition-colors"
                        >
                          {p.legal_name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-1 text-ink-muted">{stageLabel(p.stage)}</td>
                      <td className="py-2.5 px-1 text-right tnum text-ink-muted">
                        {(p.similarity * 100).toFixed(1)}%
                      </td>
                      <td
                        className="py-2.5 px-1 text-right tnum"
                        style={{ color: scoreBand(p.composite_score).color }}
                      >
                        {p.composite_score?.toFixed(0) ?? "—"}
                      </td>
                      <td className="py-2.5 px-1 text-right tnum text-ink-muted">
                        {compactUsd(p.total_funding_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No comparable peers found" />
          )}
        </Card>
      )}

      {similar.length > 0 && (
        <div>
          <SectionHeader eyebrow="Related" title="Similar companies" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similar.map((p) => (
              <Link
                key={p.startup_id}
                to={`/startup/${p.startup_id}`}
                className="card card-lit interactive p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink truncate">
                    {p.legal_name}
                  </span>
                  <span
                    className="tnum text-[13px] font-semibold shrink-0"
                    style={{ color: scoreBand(p.composite_score).color }}
                  >
                    {p.composite_score?.toFixed(0) ?? "—"}
                  </span>
                </div>
                <p className="text-[11.5px] text-ink-muted mt-1 line-clamp-2 leading-relaxed">
                  {p.one_liner ?? p.sector}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
