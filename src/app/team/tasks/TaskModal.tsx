"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/Modal";
import { deleteTaskNow } from "../actions";

/** A task opened from a board or client page: shown over the page, which stays put. */
export function TaskModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return <Modal title="Task" onClose={() => router.back()} wide>{children}</Modal>;
}

/** Delete from the pop-up, then close it and refresh the board behind it. */
export function DeleteTaskInModal({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!armed) return <div><button type="button" className="btn sm line" onClick={() => setArmed(true)}>Delete task</button></div>;
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <button type="button" className="btn sm warm" disabled={pending} onClick={() => startTransition(async () => {
        await deleteTaskNow(id);
        router.back();
        router.refresh();
      })}>{pending ? "Deleting…" : "Delete this task for good?"}</button>
      <button type="button" className="btn sm line" onClick={() => setArmed(false)}>Keep it</button>
    </div>
  );
}
