const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail =
          typeof body.detail === "string"
            ? body.detail
            : body.detail.map((d: any) => `${d.loc?.slice(1).join(".")}: ${d.msg}`).join("; ");
      }
    } catch {
      /* keep the status line */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ---------------------------------------------------------------- types */

export type Stage = "idea" | "seed" | "series_a" | "series_b_plus" | "growth";

export interface StartupSummary {
  startup_id: string;
  legal_name: string;
  stage: Stage;
  sector: string;
  sub_vertical: string | null;
  hq_city: string | null;
  one_liner: string | null;
  employee_count: number | null;
  status: string | null;
  verified: boolean;
  source: string;
  composite_score: number | null;
  growth_potential_score: number | null;
  risk_level_score: number | null;
  fraud_likelihood_score: number | null;
  founder_credibility_score: number | null;
  total_funding_usd: number | null;
}

export interface Attribution {
  feature: string;
  value: number | null;
  contribution: number;
  direction: "positive" | "negative";
  label: string;
}

export interface ScoreDetail {
  score_id: string;
  growth_potential_score: number;
  risk_level_score: number;
  fraud_likelihood_score: number;
  founder_credibility_score: number;
  composite_score: number;
  shap_top_features: Record<string, { method: string; features: Attribution[] }> | null;
  rationale: Record<string, string> | null;
  confidence: string;
  cohort_size: number | null;
  model_version: string;
  computed_at: string;
}

export interface Founder {
  founder_id: string;
  name: string;
  role: string | null;
  linkedin_url: string | null;
  github_username: string | null;
  prior_exits: number | null;
  domain_experience_years: number | null;
  github_commit_count_90d: number | null;
  github_followers: number | null;
}

export interface Financials {
  as_of_date: string | null;
  revenue: number | null;
  burn_rate_monthly: number | null;
  cash_balance: number | null;
  runway_months: number | null;
  cac: number | null;
  ltv: number | null;
  ltv_cac_ratio: number | null;
  tam_usd: number | null;
  sam_usd: number | null;
  active_users: number | null;
  revenue_growth_pct: number | null;
  total_funding_usd: number | null;
  gst_reported_revenue: number | null;
}

export interface FraudSignal {
  signal_id: string;
  detector: string;
  anomaly_score: number;
  reconstruction_error: number | null;
  flagged_fields: string[] | null;
  severity: "low" | "medium" | "high";
  explanation: string | null;
  reviewed_by_human: boolean;
  run_at: string;
}

export interface EnrichmentRecord {
  enrichment_id: string;
  source: string;
  is_mock: boolean;
  status: string;
  raw_response: Record<string, any> | null;
  error: string | null;
  retrieved_at: string;
}

export interface StartupDetail extends StartupSummary {
  long_description: string | null;
  website: string | null;
  hq_state: string | null;
  founded_date: string | null;
  cin: string | null;
  gstin: string | null;
  created_at: string;
  founders: Founder[];
  financials: Financials | null;
  score: ScoreDetail | null;
  fraud_signals: FraudSignal[];
  enrichments: EnrichmentRecord[];
}

export interface Match {
  startup: StartupSummary;
  match_score: number;
  preference_score: number;
  behavioral_score: number;
  network_score: number;
  quality_score: number;
  reasons: string[];
  cold_start: boolean;
}

export interface Investor {
  investor_id: string;
  name: string;
  email: string | null;
  investor_type: string;
  firm_name: string | null;
  kyc_status: string;
  accredited_investor: boolean;
  created_at: string;
  preference: {
    ticket_size_min: number | null;
    ticket_size_max: number | null;
    stage_preference: Stage[];
    preferred_sectors: string[];
    geographic_preference: string[];
    risk_tolerance: string;
  } | null;
}

export interface PlatformStats {
  startups: number;
  scored: number;
  verified: number;
  investors: number;
  behavioral_events: number;
  enrichment_calls: number;
  flagged_startups: number;
  avg_composite_score: number | null;
  total_tracked_funding_usd: number;
}

export interface Benchmark {
  startup_id: string;
  cohort_size: number;
  confidence: string;
  peers: {
    startup_id: string;
    legal_name: string;
    sector: string;
    stage: string;
    similarity: number;
    composite_score: number | null;
    total_funding_usd: number | null;
    status: string | null;
  }[];
  percentiles: Record<string, number | null>;
  narrative: string;
}

export interface Alert {
  signal_id: string;
  startup_id: string;
  startup_name: string;
  sector: string;
  detector: string;
  severity: string;
  anomaly_score: number;
  explanation: string;
  flagged_fields: string[] | null;
  reviewed_by_human: boolean;
  run_at: string;
}

/* ---------------------------------------------------------------- calls */

export const api = {
  health: () => request<any>("/health"),
  stats: () => request<PlatformStats>("/stats"),
  sectorStats: () =>
    request<{ sector: string; count: number; avg_composite_score: number | null; avg_fraud_score: number | null }[]>(
      "/stats/sectors",
    ),
  stageStats: () =>
    request<{ stage: string; count: number; avg_composite_score: number | null }[]>("/stats/stages"),
  scoreDistribution: () =>
    request<{ bucket: string; lower: number; count: number }[]>("/stats/score-distribution"),
  fundingTimeline: () =>
    request<{ year: number; rounds: number; total_usd: number }[]>("/stats/funding-timeline"),
  cities: () => request<{ city: string; count: number }[]>("/stats/cities"),
  modelMetrics: () => request<any>("/model/metrics"),
  alerts: (limit = 20) => request<Alert[]>(`/alerts?limit=${limit}`),
  auditLog: (limit = 50) => request<any[]>(`/audit?limit=${limit}`),

  startups: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
    });
    return request<{ items: StartupSummary[]; total: number; limit: number; offset: number }>(
      `/startups?${qs}`,
    );
  },
  startup: (id: string) => request<StartupDetail>(`/startups/${id}`),
  sectors: () => request<{ sector: string; count: number }[]>("/startups/sectors"),
  createStartup: (body: unknown) =>
    request<StartupDetail>("/startups", { method: "POST", body: JSON.stringify(body) }),
  rescore: (id: string) => request<any>(`/startups/${id}/score`, { method: "POST" }),
  enrich: (id: string, force = false) =>
    request<{ trace: any; score: any }>(`/startups/${id}/enrich?force=${force}`, {
      method: "POST",
    }),
  benchmark: (id: string) => request<Benchmark>(`/startups/${id}/benchmark`),
  similar: (id: string, k = 6) => request<StartupSummary[]>(`/startups/${id}/similar?k=${k}`),

  investors: () => request<Investor[]>("/investors"),
  investor: (id: string) => request<Investor>(`/investors/${id}`),
  createInvestor: (body: unknown) =>
    request<Investor>("/investors", { method: "POST", body: JSON.stringify(body) }),
  feed: (id: string, params: Record<string, any> = {}) => {
    const qs = new URLSearchParams({ limit: "24", ...params });
    return request<Match[]>(`/investors/${id}/feed?${qs}`);
  },
  activity: (id: string) => request<any[]>(`/investors/${id}/activity`),

  track: (body: {
    investor_id: string;
    startup_id?: string;
    event_type: string;
    event_value?: Record<string, unknown>;
  }) =>
    // Fire-and-forget: behavioural tracking must never block the UI. The
    // backend mirrors this with a 202 and no body.
    fetch(`${BASE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined),

  valuation: (id: string) => request<any>(`/marketplace/valuation/${id}`),
  listings: () => request<{ disclaimer: string; items: any[] }>("/marketplace/listings"),
};
