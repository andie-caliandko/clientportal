import { formatKpi, type Rating, type Tier, type Trend } from "@/lib/health";
import type { KpiWithHistory } from "@/lib/healthData";
import { deleteKpi } from "../../actions";
import { ConfirmButton } from "../../TeamForms";
import { AddKpi, EditKpi, EditScorecardWeek, ScorecardForm } from "./HealthForms";

const RATING: Record<Rating, { label: string; meaning: string }> = {
  green: { label: "Green", meaning: "Healthy" },
  yellow: { label: "Yellow", meaning: "Needs attention" },
  red: { label: "Red", meaning: "At risk" },
};
const TIER: Record<Tier, string> = { best: "At Best", better: "At Better", good: "At Good", below: "Below Good" };
const TREND: Record<Trend, { label: string; mark: string }> = {
  improving: { label: "Improving", mark: "▲" },
  steady: { label: "Steady", mark: "▬" },
  slipping: { label: "Slipping", mark: "▼" },
};

export function RatingPill({ rating, big }: { rating: Rating; big?: boolean }) {
  return (
    <span className={`rating ${rating} ${big ? "big" : ""}`}>
      <i aria-hidden="true" />
      {RATING[rating].label}
      {big && <> · {RATING[rating].meaning}</>}
    </span>
  );
}

/** Last 8 weeks, with the three goals as faint reference lines. */
function Sparkline({ kpi }: { kpi: KpiWithHistory }) {
  const pts = kpi.history.slice(-8);
  if (!pts.length) return <span className="note">No readings yet</span>;
  const W = 168, H = 48, PAD = 6;
  const all = [...pts.map((p) => p.value), kpi.good, kpi.better, kpi.best];
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2));
  const x = (i: number) => (pts.length === 1 ? W - PAD : PAD + (i / (pts.length - 1)) * (W - PAD * 2));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const week = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`${kpi.name}, last ${pts.length} weeks, latest ${formatKpi(last.value, kpi.unit)}`}>
      {(["good", "better", "best"] as const).map((g) => (
        <line key={g} className={`goal ${g}`} x1={0} x2={W} y1={y(kpi[g])} y2={y(kpi[g])}>
          <title>{`${g[0].toUpperCase()}${g.slice(1)} goal: ${formatKpi(kpi[g], kpi.unit)}`}</title>
        </line>
      ))}
      <path d={d} className="series" />
      {pts.map((p, i) => (
        <circle key={p.week} cx={x(i)} cy={y(p.value)} r={9} className="hit">
          <title>{`Week of ${week(p.week)}: ${formatKpi(p.value, kpi.unit)}`}</title>
        </circle>
      ))}
      <circle cx={x(pts.length - 1)} cy={y(last.value)} r={4} className={`endpoint ${kpi.summary?.rating ?? ""}`} />
    </svg>
  );
}

export function HealthTab({ clientId, clientName, kpis, health, notes, thisWeek, canEdit }: {
  clientId: string;
  clientName: string;
  kpis: KpiWithHistory[];
  health: { rating: Rating; score: number } | null;
  notes: Record<string, string>;
  thisWeek: string;
  canEdit: boolean;
}) {
  const weeks = [...new Set(kpis.flatMap((k) => k.history.map((h) => h.week)))].sort().reverse().slice(0, 8);
  const lite = kpis.map((k) => ({
    id: k.id, name: k.name, unit: k.unit, higher_is_better: k.higher_is_better,
    good: k.good, better: k.better, best: k.best, benchmark: k.benchmark, history: k.history,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <p className="internal-note">Internal only. Clients never see this tab.</p>

      <div className="panel health-head">
        <div>
          <p className="eyebrow">Account health</p>
          {health ? <RatingPill rating={health.rating} big /> : <p className="note">Add KPIs and enter a scorecard to see {clientName}&apos;s health.</p>}
        </div>
        <p className="note" style={{ maxWidth: "52ch" }}>
          Each KPI is Red below Good, Yellow at Good, and Green at Better or Best. Improving week over week adds a
          little, slipping takes a little away. The average sets the account&apos;s color{health ? ` (score ${health.score} of 2.5)` : ""}.
        </p>
      </div>

      <div className="panel">
        <h2>KPIs and goals</h2>
        {kpis.length ? (
          <div className="tablewrap">
            <table className="kpi-table">
              <thead><tr><th>KPI</th><th className="kn">Good</th><th className="kn">Better</th><th className="kn">Best</th><th className="kn kpi-latest">Latest</th><th>Status</th><th>Trend</th><th>Last 8 weeks</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id}>
                    <td><b>{k.name}</b>{k.benchmark && <><br /><span className="note">Industry: {k.benchmark}</span></>}
                      <br /><span className="note">{k.higher_is_better ? "Higher is better" : "Lower is better"}</span></td>
                    <td className="kn">{formatKpi(k.good, k.unit)}</td>
                    <td className="kn">{formatKpi(k.better, k.unit)}</td>
                    <td className="kn">{formatKpi(k.best, k.unit)}</td>
                    <td className="kn kpi-latest">{k.summary ? <b>{formatKpi(k.summary.latest, k.unit)}</b> : "—"}</td>
                    <td>{k.summary ? <><RatingPill rating={k.summary.rating} /><br /><span className="note">{TIER[k.summary.tier]}</span></> : "—"}</td>
                    <td>{k.summary?.trend ? <span className={`trend ${k.summary.trend}`}><span aria-hidden="true">{TREND[k.summary.trend].mark}</span> {TREND[k.summary.trend].label}</span> : <span className="note">Needs 2 weeks</span>}</td>
                    <td><Sparkline kpi={k} /></td>
                    {canEdit && (
                      <td>
                        <EditKpi clientId={clientId} kpi={lite.find((l) => l.id === k.id)!} />
                        <form action={deleteKpi}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="client" value={clientId} />
                          <ConfirmButton label="Remove" confirmLabel="Remove KPI and its history?" />
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note">No KPIs yet. Add the numbers you track for {clientName}, with your Good, Better and Best goals.</p>
        )}
        {canEdit && <AddKpi clientId={clientId} />}
      </div>

      {canEdit && kpis.length > 0 && (
        <div className="panel">
          <h2>Weekly scorecard</h2>
          <ScorecardForm clientId={clientId} kpis={lite} notes={notes} thisWeek={thisWeek} />
        </div>
      )}

      {weeks.length > 0 && (
        <div className="panel">
          <h2>Scorecard history</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Week of</th>{kpis.map((k) => <th key={k.id}>{k.name}</th>)}<th>Notes</th>{canEdit && <th><span className="sr-only">Edit</span></th>}</tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w}>
                    <td>{new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</td>
                    {kpis.map((k) => {
                      const v = k.history.find((h) => h.week === w)?.value;
                      return <td key={k.id} className="kn">{v === undefined ? "—" : formatKpi(v, k.unit)}</td>;
                    })}
                    <td style={{ whiteSpace: "normal", minWidth: 200 }}>{notes[w] ?? ""}</td>
                    {canEdit && <td><EditScorecardWeek clientId={clientId} kpis={lite} notes={notes} week={w} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
