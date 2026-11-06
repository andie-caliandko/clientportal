import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isOwner } from "@/lib/ceo";
import { rates } from "@/lib/pricing";
import { loadPricing } from "@/lib/pricing.server";
import { requireTeam } from "@/lib/session";
import { OffersView } from "./OffersView";
import { QuoteEditor, QuoteList } from "./QuotesView";
import { RatesView } from "./RatesView";

export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "rates", label: "Rate & capacity" },
  { id: "offers", label: "Offer suite" },
  { id: "quotes", label: "Quotes" },
] as const;
type View = (typeof VIEWS)[number]["id"];

/** The owner's pricing calculator: hourly rates, the offer suite priced by its hours, capacity and quotes. Never shared. */
export default async function Pricing({ searchParams }: { searchParams: Promise<{ view?: string; quote?: string }> }) {
  const { agency, userId } = await requireTeam();
  if (!isOwner(agency, userId)) redirect("/team");
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : "rates";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone }).format(new Date());
  const p = await loadPricing(agency.id, today.slice(0, 7));
  const r = rates(p.settings, p.team.lines, p.expenses.lines);

  let body: React.ReactNode;
  if (view === "rates") body = <RatesView initial={p.settings} offers={p.offers} team={p.team} expenses={p.expenses} />;
  else if (view === "offers") body = <OffersView initial={p.offers} r={r} />;
  else if (sp.quote) {
    const q = p.quotes.find((x) => x.id === sp.quote);
    if (!q) notFound();
    body = <QuoteEditor key={q.id} initial={q} offers={p.offers} r={r} />;
  } else body = <QuoteList quotes={p.quotes} r={r} today={today} />;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="top">
        <div>
          <p className="eyebrow">Only you</p>
          <h1 style={{ marginTop: 6 }}>Pricing</h1>
        </div>
      </div>
      <nav className="tabs ceo-tabs trk-views" aria-label="Pricing">
        {VIEWS.map((v) => <Link key={v.id} href={`/team/ceo/pricing?view=${v.id}`} aria-selected={v.id === view} aria-current={v.id === view ? "page" : undefined}>{v.label}</Link>)}
      </nav>
      {body}
    </section>
  );
}
