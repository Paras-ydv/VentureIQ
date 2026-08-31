import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Match } from "../lib/api";
import { stageLabel } from "../lib/format";
import { StartupCard } from "../components/StartupCard";
import { Badge, Card, Empty } from "../components/primitives";
import { useInvestor } from "../lib/investor-context";

function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] text-ink-faint w-16 shrink-0">{label}</span>
      <div className="h-1 flex-1 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[color:var(--color-brand)]"
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      <span className="tnum text-[10.5px] text-ink-muted w-6 text-right shrink-0">
        {Math.round(value)}
      </span>
    </div>
  );
}

export default function Feed() {
  const { current, track } = useInvestor();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [excludeSeen, setExcludeSeen] = useState(false);

  useEffect(() => {
    if (!current) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .feed(current.investor_id, { limit: 24, exclude_seen: excludeSeen })
      .then(setMatches)
      .finally(() => setLoading(false));
  }, [current, excludeSeen]);

  if (!current) {
    return (
      <Card>
        <Empty
          title="No investor profile selected"
          hint="Create an investor profile to get a personalised, ranked deal feed."
        />
        <div className="flex justify-center pb-8">
          <Link to="/onboarding" className="btn btn-primary">
            Set up profile
          </Link>
        </div>
      </Card>
    );
  }

  const coldStart = matches[0]?.cold_start;
  const pref = current.preference;

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[27px] font-semibold tracking-tight leading-tight">
            Deal feed for {current.name}
          </h1>
          <p className="text-[13.5px] text-ink-muted mt-1.5">
            Ranked by stated mandate, your behaviour on the platform, co-investor network
            position, and each company's own quality score.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={excludeSeen}
            onChange={(e) => setExcludeSeen(e.target.checked)}
            className="accent-[color:var(--color-brand)]"
          />
          Hide companies I've seen
        </label>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div>
            <span className="eyebrow">Mandate</span>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {pref?.preferred_sectors.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
              {pref?.stage_preference.map((s) => (
                <span key={s} className="chip">
                  {stageLabel(s)}
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={current.kyc_status === "verified" ? "good" : "warning"}>
              KYC {current.kyc_status}
            </Badge>
            {coldStart && <Badge tone="warning">Cold start — using stated preferences only</Badge>}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 258 }} />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <Empty title="No matches yet" hint="Broaden your mandate or add more sectors." />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {matches.map((m) => (
            <div key={m.startup.startup_id} className="flex flex-col gap-2">
              <StartupCard
                s={m.startup}
                matchScore={m.match_score}
                reasons={m.reasons}
                onOpen={() => track("view", m.startup.startup_id)}
              />
              <Card className="p-3 space-y-1.5" lit={false}>
                <div className="eyebrow mb-1.5">Match breakdown</div>
                <SignalBar label="Mandate" value={m.preference_score} />
                <SignalBar label="Behaviour" value={m.behavioral_score} />
                <SignalBar label="Network" value={m.network_score} />
                <SignalBar label="Quality" value={m.quality_score} />
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
