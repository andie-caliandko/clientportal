import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/lib/brand";
import { formatKpi, type Tier } from "@/lib/health";
import { loadHealth } from "@/lib/healthData";
import { kpiReport, rangeDates, RANGES, type KpiReport, type RangeKey } from "@/lib/report";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { clientLogoUrl } from "@/lib/links";
import { PrintButton } from "./PrintButton";
import { Chart } from "./Chart";

const TIER: Record<Tier, { label: string; cls: string }> = {
  best: { label: "Best", cls: "ok" },
  better: { label: "Better", cls: "ok" },
  good: { label: "Good", cls: "warn" },
  below: { label: "Below Good", cls: "crit" },
};

/** KPI scorecard report for a period, to share with the client or the team. */
export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; for?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { agency, member } = await requireTeam();
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, name, logo_path, archived_at").eq("id", id).maybeSingle();
  if (!client || (client.archived_at && member.role !== "admin")) notFound();

  const tz = agency.timezone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const range = (RANGES.some((r) => r.key === sp.range) ? sp.range : "month") as RangeKey;
  const { from, to } = rangeDates(range, today, { from: sp.from, to: sp.to });
  const audience = sp.for === "team" ? "team" : "client";

  const [{ byClient }, { data: noteRows }] = await Promise.all([
    loadHealth(supabase, [client.id]),
    audience === "team"
      ? supabase.from("scorecard_notes").select("week, note").eq("client_id", client.id).gte("week", from).lte("week", to).order("week")
      : Promise.resolve({ data: [] as { week: string; note: string }[] }),
  ]);
  const kpis = (byClient.get(client.id) ?? []).map((k) => ({ kpi: k, r: kpiReport(k, k.history, from, to) }));
  const withData = kpis.filter((k) => k.r.last !== null);
  const improved = withData.filter((k) => k.r.better === true).length;
  const onTarget = withData.filter((k) => k.r.tier && k.r.tier !== "below").length;

  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const period = `${fmtDay(from)} – ${fmtDay(to, { month: "short", day: "numeric", year: "numeric" })}`;
  const q = (over: Record<string, string>) =>
    `/team/clients/${client.id}/report?${new URLSearchParams({ range, ...(range === "custom" ? { from, to } : {}), for: audience, ...over })}`;
  const logo = clientLogoUrl(client.logo_path);

  return (
    <section className="report-page">
      <div className="no-print" style={{ display: "grid", gap: 14 }}>
        <Link href={`/team/clients/${client.id}?tab=health`} className="note">← Back to account health</Link>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <nav className="view-switch" aria-label="Time frame" style={{ flexWrap: "wrap" }}>
            {RANGES.filter((r) => r.key !== "custom").map((r) => (
              <Link key={r.key} href={q({ range: r.key })} aria-current={range === r.key ? "page" : undefined}>{r.label}</Link>
            ))}
          </nav>
          <div className="row" style={{ alignItems: "center" }}>
            <nav className="view-switch" aria-label="Who it's for">
              <Link href={q({ for: "client" })} aria-current={audience === "client" ? "page" : undefined}>For the client</Link>
              <Link href={q({ for: "team" })} aria-current={audience === "team" ? "page" : undefined}>For the team</Link>
            </nav>
            <PrintButton />
          </div>
        </div>
        <form className="row" style={{ alignItems: "flex-end" }} action={`/team/clients/${client.id}/report`}>
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="for" value={audience} />
          <div className="field"><label htmlFor="rp-from">From</label><input className="input" id="rp-from" name="from" type="date" defaultValue={from} /></div>
          <div className="field"><label htmlFor="rp-to">To</label><input className="input" id="rp-to" name="to" type="date" defaultValue={to} /></div>
          <button className="btn sm line">Use these dates</button>
        </form>
        {audience === "client" && <p className="note">This version leaves out goals, ratings and internal notes, so it&apos;s ready to share with {client.name}.</p>}
      </div>

      <article className="report">
        <header className="report-head">
          <div>
            <p className="eyebrow">{audience === "team" ? "Internal · account health" : "Performance report"}</p>
            <h1>{client.name}</h1>
            <p className="note">{period}</p>
          </div>
          <div className="report-logos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt={`${client.name} logo`} />}
            <Logo brand={agency.brand} name={agency.name} height={44} />
          </div>
        </header>

        {!kpis.length ? (
          <p className="note">No KPIs are set up for {client.name} yet. Add them on the Account health tab.</p>
        ) : (
          <>
            <div className="report-summary">
              <div><b>{withData.length}</b><span>KPI{withData.length === 1 ? "" : "s"} tracked this period</span></div>
              <div><b>{improved}</b><span>moved in the right direction</span></div>
              {audience === "team" && <div><b>{onTarget}</b><span>at Good or better</span></div>}
            </div>
            <div className="report-kpis">
              {kpis.map(({ kpi, r }) => (
                <section key={kpi.id} className="report-kpi">
                  <div className="report-kpi-head">
                    <h2>{kpi.name}</h2>
                    {audience === "team" && r.tier && <span className={`pill ${TIER[r.tier].cls}`}>{TIER[r.tier].label}</span>}
                  </div>
                  {r.last === null ? (
                    <p className="note">No numbers entered for this period.</p>
                  ) : (
                    <>
                      <p className="report-value">{formatKpi(r.last, kpi.unit)}</p>
                      <p className="report-change">{changeText(r, kpi.unit, fmtDay)}</p>
                      <Chart r={r} unit={kpi.unit} goals={audience === "team" ? kpi : null} fmtDay={fmtDay} />
                      <dl className="report-stats">
                        <dt>High</dt><dd>{formatKpi(r.high!, kpi.unit)}</dd>
                        <dt>Low</dt><dd>{formatKpi(r.low!, kpi.unit)}</dd>
                        <dt>Average</dt><dd>{formatKpi(r.average!, kpi.unit)}</dd>
                        {audience === "team" && <><dt>Goals</dt><dd>Good {formatKpi(kpi.good, kpi.unit)} · Better {formatKpi(kpi.better, kpi.unit)} · Best {formatKpi(kpi.best, kpi.unit)}</dd></>}
                      </dl>
                      <details className="report-table">
                        <summary>Weekly numbers</summary>
                        <table>
                          <thead><tr><th scope="col">Week of</th><th scope="col">{kpi.name}</th></tr></thead>
                          <tbody>{r.points.map((p) => <tr key={p.week}><td>{fmtDay(p.week)}</td><td className="kn">{formatKpi(p.value, kpi.unit)}</td></tr>)}</tbody>
                        </table>
                      </details>
                    </>
                  )}
                </section>
              ))}
            </div>
            {audience === "team" && (noteRows ?? []).length > 0 && (
              <section className="report-notes">
                <h2>Scorecard notes</h2>
                <ul className="list">{(noteRows ?? []).map((n) => <li key={n.week}><b>Week of {fmtDay(n.week)}</b> {n.note}</li>)}</ul>
              </section>
            )}
          </>
        )}
        <footer className="report-foot note">
          Prepared by {agency.name} · {fmtDay(today, { month: "long", day: "numeric", year: "numeric" })}
        </footer>
      </article>
    </section>
  );
}

function changeText(r: KpiReport, unit: "number" | "percent" | "currency", fmtDay: (d: string) => string) {
  if (r.points.length < 2 || r.change === null) return `One reading this period (week of ${fmtDay(r.points[0].week)}).`;
  if (r.change === 0) return `No change since the week of ${fmtDay(r.points[0].week)}.`;
  const dir = r.change > 0 ? "Up" : "Down";
  const amount = unit === "percent" ? `${Math.abs(Number(r.change.toFixed(2)))} points` : r.pct !== null ? `${Math.abs(Math.round(r.pct * 100))}%` : formatKpi(Math.abs(r.change), unit);
  return `${r.change > 0 ? "▲" : "▼"} ${dir} ${amount} since the week of ${fmtDay(r.points[0].week)} (${formatKpi(r.first!, unit)} → ${formatKpi(r.last!, unit)})`;
}
