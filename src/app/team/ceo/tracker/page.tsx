import Link from "next/link";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/ceo";
import { monthName, yearSummary } from "@/lib/ceoTracker";
import { loadMonth, loadMonths, loadVision, portalIncome } from "@/lib/ceoTracker.server";
import { requireTeam } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ExportPdf } from "./ExportPdf";
import { LeadsView, type Lead } from "./LeadsView";
import { MonthView } from "./MonthView";
import { VisionView } from "./VisionView";
import { YearView } from "./YearView";

export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "leads", label: "Leads" },
  { id: "vision", label: "North Star" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** The owner's monthly scorecard, lead tracker and North Star vision (their CEO spreadsheet, in the portal). Never shared. */
export default async function CeoTracker({ searchParams }: { searchParams: Promise<{ view?: string; month?: string; year?: string }> }) {
  const { agency, userId } = await requireTeam();
  // Only the owner, even when the CEO dashboard is shared with admins.
  if (!isOwner(agency, userId)) redirect("/team");
  const sp = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const view: View = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : "month";
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : month.slice(0, 4);
  const thisYear = today.slice(0, 4);
  const years = [...new Set([String(Number(thisYear) - 1), thisYear, String(Number(thisYear) + 1), year])].sort();

  let body: React.ReactNode;
  if (view === "month") {
    const [m, portal] = await Promise.all([loadMonth(agency.id, month), portalIncome(month)]);
    body = <MonthView key={month} month={month} initial={m.data} initialDaily={m.daily} days={m.days} lastExpenses={m.lastExpenses} lastIncome={m.lastIncome} portal={portal} />;
  } else if (view === "year") {
    body = <YearView year={year} months={await loadMonths(agency.id, `${year}-01`, `${year}-12`)} today={today} />;
  } else if (view === "leads") {
    const { data } = await (await createClient()).from("ceo_leads").select("*").eq("agency_id", agency.id).order("created_at", { ascending: false });
    body = <LeadsView initial={(data ?? []) as Lead[]} today={today} />;
  } else {
    const [vision, months, portal] = await Promise.all([loadVision(agency.id), loadMonths(agency.id, `${thisYear}-01`, today.slice(0, 7)), portalIncome(today.slice(0, 7))]);
    const y = yearSummary(months);
    body = <VisionView initial={vision} rates={{
      year: thisYear, closeRate: y.closeRate, showRate: y.showRate, touchPerCall: y.touchPerCall, callsPerPost: y.callsPerPost,
      retainer: portal.clients ? portal.total / portal.clients : null,
    }} />;
  }

  const here = (v: View) => `/team/ceo/tracker?view=${v}${v === "month" ? `&month=${month}` : v === "year" ? `&year=${year}` : ""}`;
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Only you{view === "month" ? ` · ${monthName(month)}` : view === "year" ? ` · ${year}` : ""}</p>
          <h1 style={{ marginTop: 6 }}>CEO tracker</h1>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          {view === "month" && (
            <>
              <Link className="btn sm line" href={`/team/ceo/tracker?month=${shiftMonth(month, -1)}`} aria-label="Previous month" scroll={false}>←</Link>
              {month !== today.slice(0, 7) && <Link className="btn sm line" href="/team/ceo/tracker" scroll={false}>This month</Link>}
              <Link className="btn sm line" href={`/team/ceo/tracker?month=${shiftMonth(month, 1)}`} aria-label="Next month" scroll={false}>→</Link>
            </>
          )}
          {view === "year" && (
            <>
              <Link className="btn sm line" href={`/team/ceo/tracker?view=year&year=${Number(year) - 1}`} aria-label="Previous year" scroll={false}>←</Link>
              <Link className="btn sm line" href={`/team/ceo/tracker?view=year&year=${Number(year) + 1}`} aria-label="Next year" scroll={false}>→</Link>
            </>
          )}
          <ExportPdf current={view === "year" ? `${year}-01` : month} years={years} />
        </div>
      </div>
      <nav className="tabs ceo-tabs trk-views" aria-label="CEO tracker">
        {VIEWS.map((v) => <Link key={v.id} href={here(v.id)} aria-selected={v.id === view} aria-current={v.id === view ? "page" : undefined}>{v.label}</Link>)}
      </nav>
      {body}
    </section>
  );
}
