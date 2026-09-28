import { TaskDetail } from "../../../tasks/TaskDetail";
import { TaskModal } from "../../../tasks/TaskModal";

// Clicking a task on a board or client page opens it here, over that page.
// Opening /team/tasks/<id> directly still shows the full page.
export default async function TaskPopup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskModal><TaskDetail id={id} inModal /></TaskModal>;
}
