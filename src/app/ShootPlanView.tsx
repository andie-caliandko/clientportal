import { isScript, lines, usedFor, type ShootPlan } from "@/lib/shootPlan";

/** A sent shoot plan, read-only, in the same order as the PDF. */
export function ShootPlanView({ plan }: { plan: ShootPlan }) {
  const setupName = (id: string) => plan.setups.find((s) => s.id === id)?.name ?? "";
  const bonus = lines(plan.bonus);
  return (
    <div className="plan-view">
      {plan.timeline.length > 0 && (
        <div>
          <h3>Schedule</h3>
          <ol className="plan-timeline">{plan.timeline.map((t, i) => <li key={i}><b>{t.time}</b><span>{t.text}</span></li>)}</ol>
        </div>
      )}
      {(plan.purpose || plan.goal || plan.tone) && (
        <div>
          <h3>Overview</h3>
          {plan.purpose && <p className="plan-overview">{plan.purpose}</p>}
          {plan.goal && <p><b>Goal:</b> {plan.goal}</p>}
          {plan.tone && <p><b>Direction:</b> {plan.tone}</p>}
        </div>
      )}
      {plan.locations.length > 0 && (
        <div>
          <h3>Locations</h3>
          <div className="plan-table-wrap"><table className="plan-table read">
            <thead><tr><th>Venue</th><th>Address</th><th>Used for</th><th>Notes</th></tr></thead>
            <tbody>{plan.locations.map((l) => <tr key={l.id}><td>{l.venue}</td><td>{l.address}</td><td>{usedFor(plan, l.venue).join(", ")}</td><td>{l.notes}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      {plan.needsModels && plan.models.length > 0 && (
        <div>
          <h3>Models</h3>
          <div className="plan-table-wrap"><table className="plan-table read">
            <thead><tr><th>Name</th><th>Setups</th><th>Size</th><th>Waiver</th></tr></thead>
            <tbody>{plan.models.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.setupIds.map(setupName).filter(Boolean).join(", ")}</td><td>{m.size}</td><td>{m.waiverSigned ? "Signed" : "Not yet"}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      {plan.setups.map((s, i) => {
        const shots = s.shots.filter((r) => !isScript(r.type));
        const scripts = s.shots.filter((r) => isScript(r.type) && r.shots);
        return (
        <div key={s.id}>
          <h3>Setup {i + 1}: {s.name}{s.featuring ? ` (${s.featuring})` : ""}</h3>
          {(s.time || s.location) && <p className="note">{[s.time, s.location].filter(Boolean).join(" · ")}</p>}
          <div className="plan-table-wrap"><table className="plan-table read">
            <thead><tr><th>Shot type</th><th>Shots to get</th><th>Products / wardrobe</th><th>Props</th></tr></thead>
            <tbody>
              {(shots.length ? shots : [{ type: "", shots: "" }]).map((r, k) => (
                <tr key={k}>
                  <td><b>{r.type}</b></td>
                  <td className="plan-overview">{r.shots}</td>
                  {k === 0 && <td rowSpan={Math.max(1, shots.length)}><ul className="plan-checks">{lines(s.products).map((x) => <li key={x}>{x}</li>)}</ul></td>}
                  {k === 0 && <td rowSpan={Math.max(1, shots.length)}><ul>{lines(s.props).map((x) => <li key={x}>{x}</li>)}</ul></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
          {scripts.map((r, k) => <div className="plan-script-read" key={k}><b>{r.type}</b>{r.shots}</div>)}
        </div>
        );
      })}
      {bonus.length > 0 && <div><h3>Bonus b-roll</h3><ul>{bonus.map((b) => <li key={b}>{b}</li>)}</ul></div>}
    </div>
  );
}
