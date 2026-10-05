"use client";

import { useState } from "react";
import { Modal } from "@/app/Modal";

/** "View questionnaire answers": the client's answers in a pop-up over the page. */
export function AnswersButton({ clientId, clientName, items }: { clientId: string; clientName: string; items: { id: string; position: number; prompt: string; answer: string }[] }) {
  const [open, setOpen] = useState(false);
  const answered = items.filter((q) => q.answer.trim()).length;
  return (
    <>
      <button type="button" className="btn sm line" onClick={() => setOpen(true)}>View questionnaire answers</button>
      {open && (
        <Modal title={`${clientName}'s questionnaire`} onClose={() => setOpen(false)} wide>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <p className="note">{answered} of {items.length} answered</p>
            <a className="btn sm line" href={`/team/clients/${clientId}/answers.pdf`} download>Download PDF</a>
          </div>
          <dl style={{ display: "grid", gap: 16, margin: 0 }}>
            {items.map((q) => (
              <div key={q.id}>
                <dt style={{ fontWeight: 600 }}>{q.position}. {q.prompt}</dt>
                <dd style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: q.answer ? "var(--ink)" : "var(--ink-2)" }}>
                  {q.answer || "Not answered yet"}
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </>
  );
}
