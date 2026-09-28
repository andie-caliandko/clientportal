import { formatKpi } from "@/lib/health";
import type { KpiReport } from "@/lib/report";

/** A simple line of the weekly readings, drawn to scale. Goal lines on the team version. */
export function Chart({ r, unit, goals, fmtDay }: {
  r: KpiReport;
  unit: "number" | "percent" | "currency";
  goals: { good: number; best: number } | null;
  fmtDay: (d: string) => string;
}) {
  const W = 560, H = 150, L = 64, R = 16, T = 14, B = 26;
  const values = r.points.map((p) => p.value);
  const lines = goals ? [goals.good, goals.best] : [];
  let lo = Math.min(...values, ...lines), hi = Math.max(...values, ...lines);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const x = (i: number) => (r.points.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (r.points.length - 1));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = r.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = r.points.length - 1;
  return (
    <svg className="report-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly readings from ${formatKpi(values[0], unit)} to ${formatKpi(values[last], unit)}`}>
      <line x1={L} x2={W - R} y1={y(hi - pad)} y2={y(hi - pad)} className="grid" />
      <line x1={L} x2={W - R} y1={y(lo + pad)} y2={y(lo + pad)} className="grid" />
      <text x={L - 8} y={y(hi - pad)} className="axis" textAnchor="end" dominantBaseline="middle">{formatKpi(hi - pad, unit)}</text>
      <text x={L - 8} y={y(lo + pad)} className="axis" textAnchor="end" dominantBaseline="middle">{formatKpi(lo + pad, unit)}</text>
      {goals && (
        <>
          <line x1={L} x2={W - R} y1={y(goals.good)} y2={y(goals.good)} className="goal" />
          <text x={W - R} y={y(goals.good) - 4} className="axis" textAnchor="end">Good</text>
          <line x1={L} x2={W - R} y1={y(goals.best)} y2={y(goals.best)} className="goal" />
          <text x={W - R} y={y(goals.best) - 4} className="axis" textAnchor="end">Best</text>
        </>
      )}
      <path d={path} className="line" fill="none" />
      {r.points.map((p, i) => <circle key={p.week} cx={x(i)} cy={y(p.value)} r={i === last ? 5 : 3} className={i === last ? "end" : "dot"} />)}
      <text x={x(0)} y={H - 6} className="axis" textAnchor={r.points.length === 1 ? "middle" : "start"}>{fmtDay(r.points[0].week)}</text>
      {last > 0 && <text x={x(last)} y={H - 6} className="axis" textAnchor="end">{fmtDay(r.points[last].week)}</text>}
    </svg>
  );
}
