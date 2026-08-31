import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Alert, type PlatformStats } from "../lib/api";
import { compactNum, compactUsd, relativeTime, SEVERITY_COLOR, stageLabel } from "../lib/format";
import { BarChart, HBarChart, LineChart } from "../components/charts";
import { Badge, Card, SectionHeader, SkeletonRows, Stat } from "../components/primitives";

export default function Overview() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [sectors, setSectors] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [dist, setDist] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stats(),
      api.sectorStats(),
      api.stageStats(),
      api.scoreDistribution(),
      api.fundingTimeline(),
      api.cities(),
      api.alerts(6),
    ])
      .then(([s, sec, stg, d, t, c, a]) => {
        setStats(s);
        setSectors(sec);
        setStages(stg);
        setDist(d);
        setTimeline(t.filter((x: any) => x.year >= 2015));
        setCities(c);
        setAlerts(a);
      })
      .finally(() => setLoading(false));
  }, []);

  const flaggedPct =
    stats && stats.startups ? ((stats.flagged_startups / stats.startups) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-7 animate-in">
      <div>
        <h1 className="text-[27px] font-semibold tracking-tight leading-tight">
          Investment intelligence overview
        </h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-2xl leading-relaxed">
          Every startup below has been scored across four independent dimensions and
          cross-checked against external sources. Scores are explainable by design — open any
          company to see exactly which features drove its rating.
        </p>
      </div>

      {loading ? (
        <SkeletonRows n={2} height={96} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Startups indexed"
              value={compactNum(stats?.startups)}
              sub={`${compactNum(stats?.scored)} fully scored · ${compactNum(stats?.verified)} registry-verified`}
            />
            <Stat
              label="Capital tracked"
              value={compactUsd(stats?.total_tracked_funding_usd)}
              sub="Across all recorded funding rounds"
            />
            <Stat
              label="Flagged for review"
              value={compactNum(stats?.flagged_startups)}
              accent="var(--color-serious)"
              sub={`${flaggedPct}% of corpus · anomaly + rule detectors`}
            />
            <Stat
              label="Mean composite"
              value={stats?.avg_composite_score?.toFixed(1) ?? "—"}
              sub={`${compactNum(stats?.behavioral_events)} behavioural events captured`}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-2">
              <SectionHeader
                eyebrow="Distribution"
                title="Composite score across the corpus"
                description="How the platform's own ratings are spread. A healthy distribution is broad — if everything scored 80+, the score would not be discriminating between companies."
              />
              <BarChart
                data={dist.map((d) => ({
                  label: String(d.lower),
                  value: d.count,
                  sublabel: `score ${d.bucket}`,
                }))}
                valueFormat={(v) => `${compactNum(v)} startups`}
                height={190}
              />
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="By stage" title="Stage mix" />
              <HBarChart
                data={stages.map((s) => ({
                  label: stageLabel(s.stage),
                  value: s.count,
                  meta: s.avg_composite_score ? `avg ${s.avg_composite_score}` : undefined,
                }))}
                valueFormat={compactNum}
              />
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5">
              <SectionHeader
                eyebrow="Sectors"
                title="Largest sectors"
                description="Ranked by company count, with the mean composite score for each."
              />
              <HBarChart
                data={sectors.slice(0, 8).map((s) => ({
                  label: s.sector,
                  value: s.count,
                  meta: s.avg_composite_score ? `avg ${s.avg_composite_score}` : undefined,
                }))}
                valueFormat={compactNum}
                color="var(--color-series-3)"
              />
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="Geography" title="Startup hubs" />
              <HBarChart
                data={cities.slice(0, 8).map((c) => ({ label: c.city, value: c.count }))}
                valueFormat={compactNum}
                color="var(--color-series-5)"
              />
            </Card>

            <Card className="p-5">
              <SectionHeader
                eyebrow="Real funding data"
                title="Rounds per year"
                description="From the seeded Indian funding dataset (2015–2021)."
              />
              {timeline.length > 1 && (
                <LineChart
                  data={timeline.map((t) => ({ label: t.year, value: t.rounds }))}
                  valueFormat={(v) => `${v} rounds`}
                  height={196}
                  color="var(--color-series-4)"
                />
              )}
            </Card>
          </div>

          <Card className="p-5">
            <SectionHeader
              eyebrow="Fraud & risk"
              title="Recent alerts"
              description="Raised by the rule engine and the unsupervised anomaly detectors. Algorithms flag; a human decides."
              action={
                <Link to="/alerts" className="btn text-[12.5px]">
                  View all
                </Link>
              }
            />
            <div className="divide-y divide-line -mx-1">
              {alerts.map((a) => (
                <Link
                  key={a.signal_id}
                  to={`/startup/${a.startup_id}`}
                  className="flex items-start gap-3 px-1 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-ink">{a.startup_name}</span>
                      <Badge tone={a.severity === "high" ? "critical" : "warning"}>
                        {a.severity}
                      </Badge>
                      <span className="chip">{a.detector.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-1 leading-relaxed line-clamp-2">
                      {a.explanation}
                    </p>
                  </div>
                  <span className="text-[11px] text-ink-faint shrink-0 tnum">
                    {relativeTime(a.run_at)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
