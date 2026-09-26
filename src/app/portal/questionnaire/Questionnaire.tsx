"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Brand, Question } from "@/lib/types";
import { saveAnswer, submitQuestionnaire } from "../actions";

export function Questionnaire({ questions, saved, start, brand, agencyName }: {
  questions: Question[];
  saved: Record<string, string>;
  start: number;
  brand: Brand;
  agencyName: string;
}) {
  const [i, setI] = useState(start);
  const [answers, setAnswers] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const lastSaved = useRef({ ...saved });
  const q = questions[i];
  const last = i === questions.length - 1;
  const value = answers[q?.id] ?? "";

  useEffect(() => box.current?.focus(), [i]);

  if (!q) return <main className="focus"><p>There are no questions to answer right now.</p><Link href="/portal">Back to your portal</Link></main>;

  const persist = () => {
    if ((lastSaved.current[q.id] ?? "") !== value) {
      lastSaved.current[q.id] = value;
      startTransition(() => saveAnswer(q.id, value));
    }
  };

  const goNext = () => {
    if (q.required && !value.trim()) {
      setError("This one needs an answer before you move on. A few words is fine.");
      box.current?.focus();
      return;
    }
    setError(null);
    persist();
    if (!last) return setI(i + 1);
    startTransition(async () => {
      await saveAnswer(q.id, value);
      const res = await submitQuestionnaire();
      if (res?.error) setError(res.error);
    });
  };

  return (
    <main className="focus">
      <div className="focus-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.mark ? <img src={brand.mark} alt={agencyName} style={{ height: 40, width: "auto" }} /> : <span className="wordmark">{agencyName}</span>}
        <Link className="btn line sm" href="/portal" onClick={persist}>Save and close</Link>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <p className="eyebrow">Onboarding questionnaire · Question {i + 1} of {questions.length}</p>
        <div className="progress"><i style={{ width: `${((i + 1) / questions.length) * 100}%` }} /></div>
      </div>
      <div className="q">
        <h2 id="q-title">{q.prompt}</h2>
        {q.hint && <p>{q.hint}</p>}
        <label htmlFor="answer" className="sr">{q.prompt}</label>
        <textarea
          ref={box}
          id="answer"
          className="input"
          value={value}
          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          onBlur={persist}
          aria-describedby="q-msg"
        />
      </div>
      <div className="nav-row">
        <button
          className="btn line"
          style={{ visibility: i === 0 ? "hidden" : "visible" }}
          onClick={() => { persist(); setError(null); setI(i - 1); }}
        >
          Back
        </button>
        <button className="btn lg" onClick={goNext} disabled={pending && last}>
          {last ? (pending ? "Sending…" : "Send my answers") : "Next"}
        </button>
      </div>
      <p id="q-msg" className={error ? "error" : "note"}>
        {error ?? "Your answers save as you go. You can close this and come back any time."}
      </p>
    </main>
  );
}
