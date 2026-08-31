import type { ReactNode } from "react";
import { scoreBand } from "../lib/format";

export function Card({
  children,
  className = "",
  lit = true,
}: {
  children: ReactNode;
  className?: string;
  lit?: boolean;
}) {
  return <div className={`card ${lit ? "card-lit" : ""} ${className}`}>{children}</div>;
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  description,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && (
          <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Circular score gauge. The numeral is the primary read; the arc is
 *  reinforcement, never the sole carrier of meaning. */
export function ScoreRing({
  value,
  size = 72,
  label,
  color,
  strokeWidth = 5,
}: {
  value: number | null;
  size?: number;
  label?: string;
  color?: string;
  strokeWidth?: number;
}) {
  const band = scoreBand(value);
  const stroke = color ?? band.color;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="tnum font-semibold leading-none"
            style={{ fontSize: size * 0.29, color: stroke }}
          >
            {value === null ? "—" : Math.round(value)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-[10.5px] font-medium text-ink-muted text-center leading-tight max-w-[84px]">
          {label}
        </span>
      )}
    </div>
  );
}

/** Horizontal score bar for dense list rows. */
export function ScoreBar({
  value,
  color,
  height = 4,
}: {
  value: number | null;
  color?: string;
  height?: number;
}) {
  const band = scoreBand(value);
  return (
    <div
      className="w-full rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)]"
      style={{ height }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${value === null ? 0 : Math.max(2, Math.min(100, value))}%`,
          backgroundColor: color ?? band.color,
          transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical" | "brand";
  icon?: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "text-ink-secondary border-line bg-raised",
    good: "text-[color:var(--color-good)] border-[rgba(12,163,12,0.3)] bg-[rgba(12,163,12,0.1)]",
    warning:
      "text-[color:var(--color-warning)] border-[rgba(250,178,25,0.3)] bg-[rgba(250,178,25,0.1)]",
    critical:
      "text-[color:var(--color-critical)] border-[rgba(208,59,59,0.34)] bg-[rgba(208,59,59,0.12)]",
    brand: "text-[color:var(--color-brand)] border-[rgba(91,157,240,0.3)] bg-[rgba(91,157,240,0.1)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className="eyebrow mb-2">{label}</div>
      <div
        className="text-[26px] font-semibold leading-none tracking-tight"
        style={{ color: accent ?? "var(--color-ink)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-ink-muted mt-2 leading-snug">{sub}</div>}
    </Card>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="text-[13.5px] text-ink-secondary font-medium">{title}</div>
      {hint && <div className="text-[12px] text-ink-muted mt-1.5 max-w-sm mx-auto">{hint}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-ink-muted">
      <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="text-[12.5px]">{label}</span>}
    </div>
  );
}

export function SkeletonRows({ n = 5, height = 64 }: { n?: number; height?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton w-full" style={{ height }} />
      ))}
    </div>
  );
}

/** Inline provenance marker. Central to this product: a user must always be
 *  able to see whether a value was independently verified or came from a
 *  mocked source. */
export function ProvenanceDot({ isMock }: { isMock: boolean }) {
  return (
    <span
      title={isMock ? "Mocked source — not independently verified" : "Live verified source"}
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{
        backgroundColor: isMock ? "var(--color-warning)" : "var(--color-good)",
      }}
    />
  );
}
