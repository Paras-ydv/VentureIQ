import { useEffect, useMemo, useState } from "react";
import { api, type StartupSummary } from "../lib/api";
import { compactNum, STAGE_LABEL } from "../lib/format";
import { StartupCard } from "../components/StartupCard";
import { Card, Empty } from "../components/primitives";
import { useInvestor } from "../lib/investor-context";

const SORTS = [
  { v: "composite_score", l: "Composite score" },
  { v: "growth", l: "Growth potential" },
  { v: "risk", l: "Safety" },
  { v: "founder", l: "Founder credibility" },
  { v: "name", l: "Name" },
  { v: "recent", l: "Recently added" },
];

export default function Discover() {
  const { track } = useInvestor();
  const [items, setItems] = useState<StartupSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [sectors, setSectors] = useState<{ sector: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState("composite_score");
  const [minScore, setMinScore] = useState(0);
  const [cleanOnly, setCleanOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(0);

  const LIMIT = 24;

  useEffect(() => {
    api.sectors().then(setSectors).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(0);
    }, 260);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    api
      .startups({
        q: debouncedQ || undefined,
        sector: sector || undefined,
        stage: stage || undefined,
        sort,
        min_score: minScore > 0 ? minScore : undefined,
        max_fraud: cleanOnly ? 25 : undefined,
        verified_only: verifiedOnly,
        limit: LIMIT,
        offset: page * LIMIT,
      })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }, [debouncedQ, sector, stage, sort, minScore, cleanOnly, verifiedOnly, page]);

  const pages = Math.ceil(total / LIMIT);
  const activeFilters = useMemo(
    () => [sector, stage, minScore > 0, cleanOnly, verifiedOnly].filter(Boolean).length,
    [sector, stage, minScore, cleanOnly, verifiedOnly],
  );

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[27px] font-semibold tracking-tight leading-tight">Discover</h1>
          <p className="text-[13.5px] text-ink-muted mt-1.5">
            {loading ? "Searching…" : `${compactNum(total)} startups match your filters`}
          </p>
        </div>
      </div>

      {/* Filters in one row above the results, per the interaction spec. */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="11" cy="11" r="7" stroke="var(--color-ink-faint)" strokeWidth="2" />
              <path
                d="m20 20-3.5-3.5"
                stroke="var(--color-ink-faint)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              className="field pl-9"
              placeholder="Search companies, sectors, descriptions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <select
            className="field w-auto shrink-0 max-w-[190px] cursor-pointer"
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s.sector} value={s.sector}>
                {s.sector} ({s.count})
              </option>
            ))}
          </select>

          <select
            className="field w-auto shrink-0 max-w-[190px] cursor-pointer"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All stages</option>
            {Object.entries(STAGE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>

          <select
            className="field w-auto shrink-0 max-w-[190px] cursor-pointer"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                Sort: {s.l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-line">
          <label className="flex items-center gap-2.5 text-[12.5px] text-ink-secondary">
            <span className="whitespace-nowrap">Min composite</span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={minScore}
              onChange={(e) => {
                setMinScore(Number(e.target.value));
                setPage(0);
              }}
              className="w-32 accent-[color:var(--color-brand)]"
            />
            <span className="tnum text-[12px] text-ink w-6">{minScore}</span>
          </label>

          <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={cleanOnly}
              onChange={(e) => {
                setCleanOnly(e.target.checked);
                setPage(0);
              }}
              className="accent-[color:var(--color-brand)]"
            />
            Hide flagged companies
          </label>

          <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => {
                setVerifiedOnly(e.target.checked);
                setPage(0);
              }}
              className="accent-[color:var(--color-brand)]"
            />
            Registry-verified only
          </label>

          {activeFilters > 0 && (
            <button
              className="text-[12px] text-ink-muted hover:text-ink ml-auto transition-colors"
              onClick={() => {
                setSector("");
                setStage("");
                setMinScore(0);
                setCleanOnly(false);
                setVerifiedOnly(false);
                setPage(0);
              }}
            >
              Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 232 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <Empty
            title="No startups match those filters"
            hint="Try widening the score threshold or clearing the sector filter."
          />
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {items.map((s) => (
              <StartupCard
                key={s.startup_id}
                s={s}
                onOpen={() => track("view", s.startup_id)}
              />
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                className="btn"
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => p - 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Previous
              </button>
              <span className="tnum text-[12.5px] text-ink-muted px-3">
                {page + 1} / {compactNum(pages)}
              </span>
              <button
                className="btn"
                disabled={page >= pages - 1}
                onClick={() => {
                  setPage((p) => p + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
