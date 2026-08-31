import { useState, type ReactNode } from "react";

/* Shared chart chrome. Grid and axes are deliberately recessive — they orient
   the eye without competing with the data. */
const GRID = "rgba(255,255,255,0.05)";
const AXIS = "rgba(255,255,255,0.11)";
const MUTED = "#6e7683";

function Tooltip({
  x,
  y,
  children,
}: {
  x: number | string;
  y: number | string;
  children: ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-line-strong bg-overlay px-2.5 py-1.5 text-[11.5px] shadow-lg whitespace-nowrap"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, calc(-100% - 9px))",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ bars */

export function BarChart({
  data,
  height = 168,
  color = "var(--color-series-1)",
  valueFormat = (v: number) => String(v),
  xLabelEvery = 1,
}: {
  data: { label: string; value: number; sublabel?: string }[];
  height?: number;
  color?: string;
  valueFormat?: (v: number) => string;
  xLabelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.value)) || 1;
  const plotH = height - 24;
  // 2px gap between adjacent bars, per the mark spec.
  const slot = 100 / data.length;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg width="100%" height={height} className="overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2="100%"
            y1={plotH - plotH * f}
            y2={plotH - plotH * f}
            stroke={GRID}
            strokeWidth="1"
          />
        ))}
        <line x1="0" x2="100%" y1={plotH} y2={plotH} stroke={AXIS} strokeWidth="1" />

        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * plotH);
          const isHover = hover === i;
          return (
            <g key={i}>
              <rect
                x={`${i * slot}%`}
                y={0}
                width={`${slot}%`}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
              <rect
                x={`calc(${i * slot}% + 1px)`}
                y={plotH - h}
                width={`calc(${slot}% - 2px)`}
                height={h}
                rx={4}
                fill={color}
                opacity={hover === null || isHover ? 1 : 0.45}
                style={{ transition: "opacity 140ms ease", pointerEvents: "none" }}
              />
            </g>
          );
        })}

        {data.map((d, i) =>
          i % xLabelEvery === 0 ? (
            <text
              key={i}
              x={`${i * slot + slot / 2}%`}
              y={height - 6}
              textAnchor="middle"
              fill={MUTED}
              fontSize="10"
              className="tnum"
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <Tooltip x={`${(hover + 0.5) * slot}%`} y={plotH - (data[hover].value / max) * plotH}>
          <span className="text-ink font-medium">{valueFormat(data[hover].value)}</span>
          <span className="text-ink-muted ml-1.5">
            {data[hover].sublabel ?? data[hover].label}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

export function HBarChart({
  data,
  valueFormat = (v: number) => String(v),
  color = "var(--color-series-1)",
  maxRows = 10,
}: {
  data: { label: string; value: number; meta?: string }[];
  valueFormat?: (v: number) => string;
  color?: string;
  maxRows?: number;
}) {
  const rows = data.slice(0, maxRows);
  const max = Math.max(...rows.map((d) => d.value)) || 1;

  return (
    <div className="space-y-2">
      {rows.map((d) => (
        <div key={d.label} className="group">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[12.5px] text-ink-secondary truncate">{d.label}</span>
            <span className="tnum text-[12px] text-ink shrink-0">
              {valueFormat(d.value)}
              {d.meta && <span className="text-ink-muted ml-2 font-sans">{d.meta}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.055)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(1.5, (d.value / max) * 100)}%`,
                backgroundColor: color,
                transition: "width 700ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ line */

export function LineChart({
  data,
  height = 180,
  color = "var(--color-series-1)",
  valueFormat = (v: number) => String(v),
}: {
  data: { label: string | number; value: number }[];
  height?: number;
  color?: string;
  valueFormat?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return null;

  const W = 100;
  const plotH = height - 24;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const min = 0;
  const px = (i: number) => (i / (data.length - 1)) * W;
  const py = (v: number) => plotH - ((v - min) / (max - min)) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(d.value)}`).join(" ");
  const area = `${line} L${W},${plotH} L0,${plotH} Z`;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.33, 0.66, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={plotH - plotH * f}
            y2={plotH - plotH * f}
            stroke={GRID}
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#lineFill)" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && (
          <>
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1="0"
              y2={plotH}
              stroke={AXIS}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={px(hover)}
              cy={py(data[hover].value)}
              r="4"
              fill={color}
              stroke="var(--color-surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {data.map((_, i) => (
          <rect
            key={i}
            x={px(i) - W / data.length / 2}
            y={0}
            width={W / data.length}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>

      <div className="absolute inset-x-0 flex justify-between px-0" style={{ top: plotH + 6 }}>
        {data.map((d, i) =>
          i % Math.ceil(data.length / 7) === 0 ? (
            <span key={i} className="tnum text-[10px]" style={{ color: MUTED }}>
              {d.label}
            </span>
          ) : (
            <span key={i} />
          ),
        )}
      </div>

      {hover !== null && (
        <Tooltip x={`${(px(hover) / W) * 100}%`} y={py(data[hover].value)}>
          <span className="text-ink font-medium">{valueFormat(data[hover].value)}</span>
          <span className="text-ink-muted ml-1.5">{data[hover].label}</span>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------- attribution (diverging) */

/** Feature contributions. Diverging by sign: one hue each way, no midpoint hue.
 *  Every row is directly labelled, so colour is pure reinforcement. */
export function AttributionBars({
  items,
}: {
  items: { label: string; contribution: number; feature: string }[];
}) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => Math.abs(i.contribution))) || 1;

  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const positive = it.contribution >= 0;
        const width = (Math.abs(it.contribution) / max) * 50;
        return (
          <div key={i}>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <span className="text-[12.5px] text-ink-secondary leading-snug">{it.label}</span>
              <span
                className="tnum text-[12px] shrink-0 font-medium"
                style={{
                  color: positive ? "var(--color-good)" : "var(--color-critical)",
                }}
              >
                {positive ? "+" : ""}
                {it.contribution.toFixed(1)}
              </span>
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.05)]">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[rgba(255,255,255,0.14)]" />
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  width: `${Math.max(1, width)}%`,
                  [positive ? "left" : "right"]: "50%",
                  backgroundColor: positive ? "var(--color-good)" : "var(--color-critical)",
                  transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- sparkline */

export function Sparkline({
  values,
  width = 68,
  height = 22,
  color = "var(--color-series-1)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
