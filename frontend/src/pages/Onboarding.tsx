import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Stage } from "../lib/api";
import { STAGE_LABEL } from "../lib/format";
import { Card, SectionHeader } from "../components/primitives";
import { useInvestor } from "../lib/investor-context";

const SECTORS = [
  "FinTech", "Enterprise Software", "AI / ML", "HealthTech", "E-Commerce",
  "Consumer Internet", "EdTech", "Logistics & Mobility", "AgriTech",
  "ClimateTech", "PropTech", "Gaming & Media", "Food & Beverage", "Industrials",
];
const CITIES = ["Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai", "Gurgaon"];
const STAGES: Stage[] = ["idea", "seed", "series_a", "series_b_plus", "growth"];

function Toggle({
  items,
  selected,
  onToggle,
  label,
}: {
  items: string[];
  selected: string[];
  onToggle: (v: string) => void;
  label: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => {
        const on = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              on
                ? "border-[color:var(--color-brand)] bg-[rgba(91,157,240,0.13)] text-[color:var(--color-brand)]"
                : "border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink-secondary"
            }`}
          >
            {label(v)}
          </button>
        );
      })}
    </div>
  );
}

/** Investor onboarding.
 *
 *  This screen is load-bearing, not a formality: with no behavioural history the
 *  matching engine has nothing else to rank on, so these stated preferences are
 *  the entire cold-start signal.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh, setCurrentId } = useInvestor();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("angel");
  const [firm, setFirm] = useState("");
  const [sebi, setSebi] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>(["seed"]);
  const [geos, setGeos] = useState<string[]>([]);
  const [risk, setRisk] = useState("medium");
  const [tmin, setTmin] = useState("25000");
  const [tmax, setTmax] = useState("500000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (arr: string[], set: (v: string[]) => void) => (v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const inv = await api.createInvestor({
        name,
        email: email || null,
        investor_type: type,
        firm_name: firm || null,
        sebi_registration_no: sebi || null,
        accredited_investor: Boolean(sebi),
        preference: {
          ticket_size_min: Number(tmin) || null,
          ticket_size_max: Number(tmax) || null,
          stage_preference: stages,
          preferred_sectors: sectors,
          geographic_preference: geos,
          risk_tolerance: risk,
        },
      });
      await refresh();
      setCurrentId(inv.investor_id);
      navigate("/feed");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in">
      <div>
        <h1 className="text-[27px] font-semibold tracking-tight leading-tight">
          Investor onboarding
        </h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5 leading-relaxed">
          Your mandate is the entire ranking signal until you've interacted with enough deals
          for behavioural learning to kick in — so it's worth being precise here.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card className="p-5">
          <SectionHeader eyebrow="Identity" title="Who you are" />
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label className="eyebrow block mb-1.5">Name *</label>
              <input
                required
                minLength={2}
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Email</label>
              <input
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Type</label>
              <select
                className="field cursor-pointer"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="angel">Angel investor</option>
                <option value="vc_fund">VC fund</option>
                <option value="family_office">Family office</option>
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Firm</label>
              <input
                className="field"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow block mb-1.5">
                SEBI registration{" "}
                <span className="normal-case text-ink-faint">
                  (auto-marks you as an accredited investor)
                </span>
              </label>
              <input
                className="field"
                value={sebi}
                onChange={(e) => setSebi(e.target.value)}
                placeholder="IN/AIF2/21-22/0912"
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader eyebrow="Mandate" title="What you invest in" />
          <div className="space-y-4">
            <div>
              <label className="eyebrow block mb-2">Sectors</label>
              <Toggle
                items={SECTORS}
                selected={sectors}
                onToggle={toggle(sectors, setSectors)}
                label={(v) => v}
              />
            </div>
            <div>
              <label className="eyebrow block mb-2">Stages</label>
              <Toggle
                items={STAGES}
                selected={stages}
                onToggle={toggle(stages, setStages)}
                label={(v) => STAGE_LABEL[v]}
              />
            </div>
            <div>
              <label className="eyebrow block mb-2">Geography</label>
              <Toggle
                items={CITIES}
                selected={geos}
                onToggle={toggle(geos, setGeos)}
                label={(v) => v}
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader eyebrow="Parameters" title="Cheque size & risk" />
          <div className="grid sm:grid-cols-3 gap-3.5">
            <div>
              <label className="eyebrow block mb-1.5">Min ticket (USD)</label>
              <input
                type="number"
                min={0}
                className="field tnum"
                value={tmin}
                onChange={(e) => setTmin(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Max ticket (USD)</label>
              <input
                type="number"
                min={0}
                className="field tnum"
                value={tmax}
                onChange={(e) => setTmax(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Risk tolerance</label>
              <select
                className="field cursor-pointer"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <p className="text-[11.5px] text-ink-muted mt-3">
            A low risk tolerance actively down-weights companies with weak runway or high burn,
            rather than just reordering them.
          </p>
        </Card>

        {error && (
          <Card className="p-4 !border-[rgba(208,59,59,0.34)] !bg-[rgba(208,59,59,0.07)]">
            <p className="text-[12.5px] text-[color:var(--color-critical)]">{error}</p>
          </Card>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create profile & view feed"}
        </button>
      </form>
    </div>
  );
}
