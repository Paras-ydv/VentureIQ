import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { m } from "motion/react";
import { useAuth } from "../lib/auth";
import { Card } from "../components/primitives";
import { Logo } from "../components/Shell";

/** Sign in or create an account.
 *
 *  Investors get an investor profile on sign-up so the feed has a mandate to
 *  work with; founders get an account that owns the startups they register.
 */
export default function Login() {
  const [params] = useSearchParams();
  const location = useLocation() as { state?: { from?: string } };
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [role, setRole] = useState<"investor" | "founder">(
    params.get("role") === "founder" ? "founder" : "investor",
  );
  const [f, setF] = useState({ email: "", password: "", name: "", firm_name: "" });
  const [investorType, setInvestorType] = useState("angel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = params.get("next") || location.state?.from || "/dashboard";
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(f.email, f.password);
      } else {
        await signUp({
          email: f.email,
          password: f.password,
          name: f.name,
          role,
          investor_type: role === "investor" ? investorType : undefined,
          firm_name: role === "investor" ? f.firm_name || null : null,
        });
      }
      navigate(role === "founder" && mode === "signup" ? "/register" : next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-plane text-ink">
      <header className="mx-auto flex h-[72px] max-w-[1320px] items-center px-5 sm:px-8">
        <Logo />
      </header>
      <div className="mx-auto grid max-w-[1100px] items-start gap-6 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="p-6 sm:p-7">
          <h1 className="text-[24px] font-extrabold tracking-tight">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            {mode === "signin"
              ? "Your feed, alerts and saved companies live behind this."
              : "It takes a minute. You can set your mandate right after."}
          </p>

          {mode === "signup" && (
            <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label="Account type">
              {(["investor", "founder"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={`relative isolate rounded-xl border p-3 text-left transition-colors ${
                    role === r ? "border-brand" : "border-line-strong hover:border-ink-disabled"
                  }`}
                >
                  {role === r && (
                    <m.span layoutId="role-pick" className="absolute inset-0 -z-10 rounded-xl bg-brand-tint" />
                  )}
                  <span className="block text-[14px] font-bold capitalize">{r}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                    {r === "investor" ? "Find and track companies" : "Register your startup"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-[13.5px] font-bold">
                  {role === "investor" ? "Your name" : "Your name"}
                </label>
                <input id="name" className="field h-11 w-full" required minLength={2} value={f.name} onChange={set("name")} autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13.5px] font-bold">Email</label>
              <input id="email" type="email" className="field h-11 w-full" required value={f.email} onChange={set("email")} autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13.5px] font-bold">Password</label>
              <input
                id="password"
                type="password"
                className="field h-11 w-full"
                required
                minLength={mode === "signup" ? 8 : undefined}
                value={f.password}
                onChange={set("password")}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signup" && <p className="mt-1 text-[12px] text-ink-muted">At least 8 characters.</p>}
            </div>

            {mode === "signup" && role === "investor" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="itype" className="mb-1.5 block text-[13.5px] font-bold">Investor type</label>
                  <select id="itype" className="field h-11 w-full" value={investorType} onChange={(e) => setInvestorType(e.target.value)}>
                    <option value="angel">Angel</option>
                    <option value="vc_fund">VC fund</option>
                    <option value="family_office">Family office</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="firm" className="mb-1.5 block text-[13.5px] font-bold">
                    Firm <span className="font-medium text-ink-muted">optional</span>
                  </label>
                  <input id="firm" className="field h-11 w-full" value={f.firm_name} onChange={set("firm_name")} autoComplete="organization" />
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-critical-line bg-critical-tint px-4 py-3 text-[13.5px] text-critical-text">
                {error}
              </div>
            )}

            <button className="btn btn-primary h-12 w-full rounded-xl text-[15px]" disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-[13.5px] text-ink-secondary">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              className="font-semibold text-brand-text hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </Card>

        <Card className="p-6 sm:p-7" lit={false}>
          <div className="eyebrow mb-2">What an account gives you</div>
          <ul className="space-y-3 text-[14px] leading-relaxed text-ink-secondary">
            <li><b className="text-ink">A feed matched to your mandate</b> — sectors, stages and cheque size, sharpened by what you open and save.</li>
            <li><b className="text-ink">A watchlist</b> — track companies with private notes and a pipeline stage.</li>
            <li><b className="text-ink">Alerts scoped to you</b> — fraud and anomaly flags in the sectors you invest in.</li>
            <li><b className="text-ink">Founders:</b> register your startup and let the agent verify it against public sources.</li>
          </ul>
          <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-muted">
            Browsing companies, scores and the model report stays open to everyone — no account needed.
            KYC here is recorded but not performed: a licensed provider would do that before any
            marketplace activity.
          </p>
        </Card>
      </div>
    </div>
  );
}
