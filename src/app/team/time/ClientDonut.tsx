import { memberColors } from "@/lib/memberColors";
import { formatMinutes } from "@/lib/time";

const R = 70;
const WIDTH = 26;
const C = 2 * Math.PI * R;
const MAX = 7; // more than this folds into "Other"

/**
 * Time by client as a donut, with every slice named beside it. Each client
 * keeps its color from week to week (by id, not by rank).
 */
export function ClientDonut({ slices, emptyText }: { slices: { id: string; name: string; minutes: number }[]; emptyText: string }) {
  const total = slices.reduce((n, s) => n + s.minutes, 0);
  if (!total) return <p className="note">{emptyText}</p>;
  const sorted = [...slices].filter((s) => s.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const shown = sorted.length > MAX + 1 ? sorted.slice(0, MAX) : sorted;
  const rest = sorted.slice(shown.length);
  const colors = memberColors(shown.map((s) => s.id));
  const parts = [
    ...shown.map((s) => ({ ...s, cls: `series-${(colors.get(s.id) ?? 0) + 1}` })),
    ...(rest.length ? [{ id: "other", name: `Other (${rest.length})`, minutes: rest.reduce((n, s) => n + s.minutes, 0), cls: "series-other" }] : []),
  ];
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Time by client: ${parts.map((p) => `${p.name} ${formatMinutes(p.minutes)}`).join(", ")}`}>
        <circle cx="100" cy="100" r={R} className="donut-track" />
        {parts.map((p) => {
          const len = (p.minutes / total) * C;
          const el = (
            <circle key={p.id} cx="100" cy="100" r={R} className={`donut-slice ${p.cls}`} strokeWidth={WIDTH}
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)">
              <title>{`${p.name}: ${formatMinutes(p.minutes)} (${Math.round((p.minutes / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="100" y="96" className="donut-total" textAnchor="middle">{formatMinutes(total)}</text>
        <text x="100" y="118" className="donut-sub" textAnchor="middle">hours</text>
      </svg>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.id}>
            <i className={p.cls} aria-hidden="true" />
            <span className="donut-name">{p.name}</span>
            <b className="kn">{formatMinutes(p.minutes)}</b>
            <span className="note kn">{Math.round((p.minutes / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
