"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "./actions";

/**
 * Start / Waiting / Done buttons on a task card. Done hides the card the
 * moment it's clicked; the save and the board refresh happen behind it.
 */
export function TaskMoves({ id, moves }: { id: string; moves: { to: string; label: string }[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div className="task-actions">
      {moves.map((m) => (
        <button key={m.to} type="button" onClick={(e) => {
          const card = (e.currentTarget.closest("[draggable]") ?? e.currentTarget.closest("article.task")) as HTMLElement | null;
          if (card) {
            if (m.to === "done") card.hidden = true;
            else card.classList.add("moving");
          }
          startTransition(async () => {
            try {
              await setTaskStatus(id, m.to);
            } catch {
              if (card) { card.hidden = false; card.classList.remove("moving"); }
            }
            router.refresh();
          });
        }}>{m.label}</button>
      ))}
    </div>
  );
}
