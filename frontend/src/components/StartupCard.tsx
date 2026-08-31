import { Link } from "react-router-dom";
import type { StartupSummary } from "../lib/api";
import { compactNum, compactUsd, fraudBand, scoreBand, stageLabel } from "../lib/format";
import { Badge, ScoreBar } from "./primitives";

function MiniScore({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number | null;
  invert?: boolean;
}) {
  const color = invert ? fraudBand(value).color : scoreBand(value).color;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-1">
        <span className="text-[10px] text-ink-faint truncate">{label}</span>
        <span className="tnum text-[10.5px] font-medium shrink-0" style={{ color }}>
          {value === null ? "—" : Math.round(value)}
        </span>
      </div>
      <ScoreBar value={value} color={color} height={3} />
    </div>
  );
}

export function StartupCard({
  s,
  onOpen,
  matchScore,
  reasons,
}: {
  s: StartupSummary;
  onOpen?: () => void;
  matchScore?: number;
  reasons?: string[];
}) {
  const band = scoreBand(s.composite_score);
  const fraud = fraudBand(s.fraud_likelihood_score);
  const flagged = (s.fraud_likelihood_score ?? 0) >= 35;

  return (
    <Link
      to={`/startup/${s.startup_id}`}
      onClick={onOpen}
      className="card card-lit interactive p-4 flex flex-col gap-3 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold tracking-tight text-ink truncate group-hover:text-[color:var(--color-brand)] transition-colors">
              {s.legal_name}
            </h3>
            {s.verified && (
              <span title="Registry-verified" className="shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-label="Verified">
                  <path
                    d="M9 12l2 2 4-4"
                    stroke="var(--color-good)"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="9" stroke="var(--color-good)" strokeWidth="1.6" />
                </svg>
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-muted mt-1 line-clamp-2 leading-relaxed">
            {s.one_liner ?? s.sub_vertical ?? "No description provided"}
          </p>
        </div>

        <div className="text-right shrink-0">
          {matchScore !== undefined ? (
            <>
              <div
                className="tnum text-[21px] font-semibold leading-none"
                style={{ color: "var(--color-brand)" }}
              >
                {Math.round(matchScore)}
              </div>
              <div className="text-[9.5px] text-ink-faint mt-1 uppercase tracking-wide">
                match
              </div>
            </>
          ) : (
            <>
              <div
                className="tnum text-[21px] font-semibold leading-none"
                style={{ color: band.color }}
              >
                {s.composite_score === null ? "—" : Math.round(s.composite_score)}
              </div>
              <div className="text-[9.5px] text-ink-faint mt-1 uppercase tracking-wide">
                composite
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="chip">{s.sector}</span>
        <span className="chip">{stageLabel(s.stage)}</span>
        {s.hq_city && <span className="chip">{s.hq_city}</span>}
        {flagged && (
          <Badge tone={fraud.label === "High risk" ? "critical" : "warning"}>{fraud.label}</Badge>
        )}
        {s.status === "acquired" && <Badge tone="good">Acquired</Badge>}
        {s.status === "public" && <Badge tone="good">Public</Badge>}
        {s.status === "inactive" && <Badge tone="neutral">Inactive</Badge>}
      </div>

      {reasons && reasons.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-2.5">
          {reasons.slice(0, 2).map((r, i) => (
            <li key={i} className="text-[11.5px] text-ink-secondary flex gap-1.5 leading-snug">
              <span className="text-[color:var(--color-brand)] shrink-0">·</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-4 gap-2.5 mt-auto pt-2.5 border-t border-line">
        <MiniScore label="Growth" value={s.growth_potential_score} />
        <MiniScore label="Safety" value={s.risk_level_score} />
        <MiniScore label="Founder" value={s.founder_credibility_score} />
        <MiniScore label="Fraud" value={s.fraud_likelihood_score} invert />
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-faint">
        <span>{s.employee_count ? `${compactNum(s.employee_count)} employees` : "—"}</span>
        <span className="tnum">
          {s.total_funding_usd ? `${compactUsd(s.total_funding_usd)} raised` : ""}
        </span>
      </div>
    </Link>
  );
}
