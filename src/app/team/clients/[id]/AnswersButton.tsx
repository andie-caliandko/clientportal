"use client";

import { useState } from "react";
import { Modal } from "@/app/Modal";

/** "View answers": the client's answers to one questionnaire in a pop-up over the page. */
export function AnswersButton({ clientId, clientName, form, title, items }: {
  clientId: string;
  clientName: string;
  form: string;
  title: string;
  items: { id: string; position: number; prompt: string; answer: string }[];
}) {
  const [open, setOpen] = useState(false);
  const answered = items.filter((q) => q.answer.trim()).length;
  return (
    <>
      <button type="button" className="linkbtn note" onClick={() => setOpen(true)} aria-label={`View ${title.toLowerCase()} answers`}>View answers</button>
      {open && (
        <Modal title={`${clientName}'s ${title.toLowerCase()}`} onClose={() => setOpen(false)} wide>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <p className="note">{answered} of {items.length} answered</p>
            <a className="btn sm line" href={`/team/clients/${clientId}/answers.pdf?form=${form}`} download>Download PDF</a>
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
