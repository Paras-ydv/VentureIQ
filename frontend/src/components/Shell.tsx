import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useInvestor } from "../lib/investor-context";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/discover", label: "Discover" },
  { to: "/feed", label: "My Feed" },
  { to: "/alerts", label: "Alerts" },
  { to: "/model", label: "Model" },
  { to: "/submit", label: "Register" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="6.5" stroke="var(--color-brand)" strokeWidth="1.4" />
        <path
          d="M6.5 8.5L12 16.5L17.5 8.5"
          stroke="var(--color-brand)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="6.6" r="1.35" fill="var(--color-brand)" />
      </svg>
      <span className="text-[14.5px] font-semibold tracking-tight">
        Venture<span className="text-[color:var(--color-brand)]">IQ</span>
      </span>
    </div>
  );
}

function InvestorSwitcher() {
  const { investors, current, setCurrentId } = useInvestor();
  const navigate = useNavigate();

  if (!investors.length) {
    return (
      <button className="btn text-[12.5px]" onClick={() => navigate("/onboarding")}>
        Create investor profile
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-[12px] font-medium text-ink">{current?.name}</span>
        <span className="text-[10.5px] text-ink-muted">
          {current?.firm_name ?? current?.investor_type.replace("_", " ")}
        </span>
      </div>
      <select
        aria-label="Switch investor profile"
        className="field w-auto py-1.5 pr-7 text-[12.5px] cursor-pointer"
        value={current?.investor_id ?? ""}
        onChange={(e) => setCurrentId(e.target.value)}
      >
        {investors.map((i) => (
          <option key={i.investor_id} value={i.investor_id}>
            {i.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* A single soft light source behind the header. One restrained glow
          reads as depth; gradients everywhere read as a template. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] z-0"
        style={{
          background:
            "radial-gradient(760px 300px at 50% -110px, rgba(91,157,240,0.10), transparent 70%)",
        }}
      />

      <header className="sticky top-0 z-40 border-b border-line bg-[rgba(10,11,13,0.82)] backdrop-blur-xl">
        <div className="mx-auto max-w-[1340px] px-5 h-14 flex items-center gap-6">
          <Logo />

          <nav className="flex items-center gap-0.5 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "text-ink bg-raised"
                      : "text-ink-muted hover:text-ink-secondary hover:bg-[rgba(255,255,255,0.03)]"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <InvestorSwitcher />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1340px] px-5 py-7">{children}</main>

      <footer className="relative z-10 border-t border-line mt-16">
        <div className="mx-auto max-w-[1340px] px-5 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-faint">
            VentureIQ — B.E. dissertation prototype, BMS College of Engineering
          </p>
          <p className="text-[11.5px] text-ink-faint">
            Marketplace flows are simulated · Enrichment sources are partly mocked
          </p>
        </div>
      </footer>
    </div>
  );
}
