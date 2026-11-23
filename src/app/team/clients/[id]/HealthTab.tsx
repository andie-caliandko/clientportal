import { bands, formatKpi, HEALTH_TEMPLATE_KEYS, showKpi, type Rating, type Trend } from "@/lib/health";
import type { KpiWithHistory } from "@/lib/healthData";
import { addHealthTemplate, deleteKpi } from "../../actions";
import { ConfirmButton } from "../../TeamForms";
import { AddKpi, EditKpi, EditScorecardWeek, MonthlyCheck, ScorecardForm, TrackHealthToggle } from "./HealthForms";

const RATING: Record<Rating, { label: string; meaning: string }> = {
  green: { label: "Green", meaning: "Healthy" },
  yellow: { label: "Yellow", meaning: "Needs attention" },
  red: { label: "Red", meaning: "At risk" },
};
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
  const monthly = kpi.cadence === "monthly";
  const pts = kpi.history.slice(monthly ? -6 : -8);
  if (!pts.length) return <span className="note">No readings yet</span>;
  const week = (w: string) => monthly
    ? new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : `Week of ${new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const span = monthly ? `last ${pts.length} months` : `last ${pts.length} weeks`;
  if (kpi.choices?.length === 3) {
    const color: Rating[] = ["red", "yellow", "green"];
    return (
      <span className="choice-dots" role="img" aria-label={`${kpi.name}, ${span}: ${pts.map((p) => showKpi(kpi, p.value)).join(", ")}`}>
        {pts.map((p) => <i key={p.week} className={color[Math.max(0, Math.min(2, Math.round(p.value)))]} title={`${week(p.week)}: ${showKpi(kpi, p.value)}`} />)}
      </span>
    );
  }
  const W = 168, H = 48, PAD = 6;
  const all = [...pts.map((p) => p.value), kpi.good, kpi.better, kpi.best];
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2));
  const x = (i: number) => (pts.length === 1 ? W - PAD : PAD + (i / (pts.length - 1)) * (W - PAD * 2));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`${kpi.name}, ${span}, latest ${formatKpi(last.value, kpi.unit)}`}>
      {(["good", "better", "best"] as const).map((g) => (
        <line key={g} className={`goal ${g}`} x1={0} x2={W} y1={y(kpi[g])} y2={y(kpi[g])}>
          <title>{`${g[0].toUpperCase()}${g.slice(1)} goal: ${formatKpi(kpi[g], kpi.unit)}`}</title>
        </line>
      ))}
      <path d={d} className="series" />
      {pts.map((p, i) => (
        <circle key={p.week} cx={x(i)} cy={y(p.value)} r={9} className="hit">
          <title>{`${week(p.week)}: ${formatKpi(p.value, kpi.unit)}`}</title>
        </circle>
      ))}
      <circle cx={x(pts.length - 1)} cy={y(last.value)} r={4} className={`endpoint ${kpi.summary?.rating ?? ""}`} />
    </svg>
  );
}

const monthName = (m: string) => new Date(`${m.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const dayName = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ColorTile({ label, sub, h, big }: { label: string; sub: string; h: { rating: Rating; score: number } | null | undefined; big?: boolean }) {
  return (
    <div className="health-tile">
      <p className="eyebrow">{label}</p>
      {h ? <RatingPill rating={h.rating} big={big} /> : <p className="note">Not scored yet</p>}
      <span className="note">{sub}</span>
    </div>
  );
}

export function HealthTab({ clientId, clientName, kpis, health, performance, relationship, notes, thisWeek, canEdit, tracked = true }: {
  clientId: string;
  tracked?: boolean;
  clientName: string;
  kpis: KpiWithHistory[];
  health: { rating: Rating; score: number } | null;
  /** The combined color of the client's own (social performance) KPIs. */
  performance?: { rating: Rating; score: number } | null;
  /** The combined color of the client health template. */
  relationship?: { rating: Rating; score: number } | null;
  notes: Record<string, string>;
  /** This week's Monday (yyyy-mm-dd). */
  thisWeek: string;
  canEdit: boolean;
}) {
  const lite = kpis.map((k) => ({
    id: k.id, name: k.name, unit: k.unit, higher_is_better: k.higher_is_better,
    good: k.good, better: k.better, best: k.best, benchmark: k.benchmark, history: k.history,
    template_key: k.template_key ?? null, category: k.category ?? null, choices: k.choices ?? null, cadence: k.cadence ?? "weekly",
  }));
  const weekly = kpis.filter((k) => k.cadence !== "monthly");
  const monthly = kpis.filter((k) => k.cadence === "monthly");
  const liteOf = (list: KpiWithHistory[]) => lite.filter((l) => list.some((k) => k.id === l.id));
  const month = thisWeek.slice(0, 7);
  const monthKey = `${month}-01`;
  const enteredThisMonth = monthly.some((k) => k.history.some((h) => h.week === monthKey));
  const missing = HEALTH_TEMPLATE_KEYS.filter((key) => !kpis.some((k) => k.template_key === key)).length;
  const weeks = [...new Set(weekly.flatMap((k) => k.history.map((h) => h.week)))].sort().reverse().slice(0, 8);
  const months = [...new Set(monthly.flatMap((k) => k.history.map((h) => h.week)))].sort().reverse().slice(0, 6);

  const table = (list: KpiWithHistory[], span: string) => (
    <div className="tablewrap">
      <table className="kpi-table">
        <thead><tr><th>KPI</th><th>Green</th><th>Yellow</th><th>Red</th><th className="kn kpi-latest">Latest</th><th>Status</th><th>Trend</th><th>{span}</th>{canEdit && <th><span className="sr-only">Change</span></th>}</tr></thead>
        <tbody>
          {list.map((k) => {
            const b = bands(k);
            return (
              <tr key={k.id}>
                <td>{k.template_key && <><span className="eyebrow">{k.category}</span><br /></>}<b>{k.name}</b>
                  {k.benchmark && <><br /><span className="note">{k.template_key ? k.benchmark : `Industry: ${k.benchmark}`}</span></>}</td>
                <td className="band">{b.green}</td><td className="band">{b.yellow}</td><td className="band">{b.red}</td>
                <td className="kn kpi-latest">{k.summary ? <b>{showKpi(k, k.summary.latest)}</b> : "—"}</td>
                <td>{k.summary ? <RatingPill rating={k.summary.rating} /> : "—"}</td>
                <td>{k.summary?.trend ? <span className={`trend ${k.summary.trend}`}><span aria-hidden="true">{TREND[k.summary.trend].mark}</span> {TREND[k.summary.trend].label}</span> : <span className="note">Needs 2 {k.cadence === "monthly" ? "months" : "weeks"}</span>}</td>
                <td><Sparkline kpi={k} /></td>
                {canEdit && (
                  <td>
                    {!k.choices && <EditKpi clientId={clientId} kpi={lite.find((l) => l.id === k.id)!} />}
                    <form action={deleteKpi}>
                      <input type="hidden" name="id" value={k.id} />
                      <input type="hidden" name="client" value={clientId} />
                      <ConfirmButton label="Remove" confirmLabel="Remove KPI and its history?" />
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const history = (list: KpiWithHistory[], periods: string[], isMonthly: boolean) => (
    <div className="tablewrap">
      <table>
        <thead><tr><th>{isMonthly ? "Month" : "Week of"}</th>{list.map((k) => <th key={k.id}>{k.name}</th>)}<th>Notes</th>{canEdit && <th><span className="sr-only">Edit</span></th>}</tr></thead>
        <tbody>
          {periods.map((w) => (
            <tr key={w}>
              <td>{isMonthly ? `${monthName(w)} ${w.slice(0, 4)}` : dayName(w)}</td>
              {list.map((k) => {
                const v = k.history.find((h) => h.week === w)?.value;
                return <td key={k.id} className="kn">{v === undefined ? "—" : showKpi(k, v)}</td>;
              })}
              <td style={{ whiteSpace: "normal", minWidth: 200 }}>{notes[w] ?? ""}</td>
              {canEdit && <td><EditScorecardWeek clientId={clientId} kpis={liteOf(list)} notes={notes} week={w} monthly={isMonthly} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <p className="internal-note">Internal only. Clients never see this tab.</p>

      <div className="panel" style={{ display: "grid", gap: 14 }}>
        {!tracked ? <div><p className="eyebrow">Account health</p><p className="not-tracked big">Not tracked</p></div> : (
          <div className="health-tiles">
            <ColorTile label="Overall" sub="70% relationship, 30% social" h={health} big />
            <ColorTile label="Social performance" sub="Weekly scorecard" h={performance} />
            <ColorTile label="Relationship" sub={`Monthly client check${enteredThisMonth ? ` · ${monthName(monthKey)}` : ""}`} h={relationship} />
          </div>
        )}
        <p className="note">
          Each KPI is Green, Yellow or Red. Improving adds a little and slipping takes a little away. Social performance averages the
          social numbers, Relationship averages Mon/Fri updates and the monthly client check, and Overall counts Relationship
          for 70% and Social performance for 30%.
        </p>
        {canEdit && <TrackHealthToggle clientId={clientId} tracked={tracked} />}
      </div>

      <div className="panel">
        <div className="sec-head"><h2>Weekly scorecard</h2><span className="pill info">Every Monday</span></div>
        <p className="note">The social numbers you track for {clientName}, plus whether Monday and Friday updates went out.</p>
        {weekly.length ? table(weekly, "Last 8 weeks") : <p className="note">No weekly KPIs yet. Add the numbers you track for {clientName}.</p>}
        {canEdit && <AddKpi clientId={clientId} />}
      </div>

      {canEdit && weekly.length > 0 && (
        <div className="panel">
          <h2>Enter this week</h2>
          <ScorecardForm clientId={clientId} kpis={liteOf(weekly)} notes={notes} thisWeek={thisWeek} />
        </div>
      )}

      <div className="panel">
        <div className="sec-head"><h2>Monthly client check</h2><span className="pill info">After the monthly call</span></div>
        <p className="note">
          {enteredThisMonth ? `${monthName(monthKey)} is entered.` : `${monthName(monthKey)} isn't entered yet.`} Answer once a month, for the whole month.
        </p>
        {monthly.length ? table(monthly, "Last 6 months") : <p className="note">No monthly KPIs yet.</p>}
        {canEdit && (
          <div className="row" style={{ alignItems: "center" }}>
            {monthly.length > 0 && <MonthlyCheck clientId={clientId} kpis={liteOf(monthly)} notes={notes} month={monthKey}
              label={`${enteredThisMonth ? "Update" : "Fill out"} the ${monthName(monthKey)} check`} />}
            {missing > 0 && (
              <form action={addHealthTemplate}>
                <input type="hidden" name="client" value={clientId} />
                <button className="btn sm line">Add the {missing} missing client health KPI{missing === 1 ? "" : "s"}</button>
              </form>
            )}
          </div>
        )}
      </div>

      {weeks.length > 0 && (
        <div className="panel">
          <h2>Weekly history</h2>
          {history(weekly, weeks, false)}
        </div>
      )}
      {months.length > 0 && (
        <div className="panel">
          <h2>Past months</h2>
          {history(monthly, months, true)}
        </div>
      )}
    </div>
  );
}
