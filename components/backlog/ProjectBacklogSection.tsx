import { Trash2 } from "lucide-react";
import BacklogTaskRow from "@/components/backlog/BacklogTaskRow";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskWithUser = {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  created_at: string | null;
  updated_at: string | null;
  assignedUser: UserRow | null;
};

type ProjectSummary = {
  id: string;
  name: string;
};

type ProjectBacklogSectionProps = {
  project: ProjectSummary;
  tasks: TaskWithUser[];
  isOpen: boolean;
  onToggle: () => void;
  onDeleteTask: (taskId: string) => void;
  onDeleteProject: () => void;
  onMarkCompleted: () => void;
  isCompleted?: boolean;
  canDelete?: boolean;
};

export default function ProjectBacklogSection({ project, tasks, isOpen, onToggle, onDeleteTask, onDeleteProject, onMarkCompleted, isCompleted, canDelete }: ProjectBacklogSectionProps) {
  const sectionClass = isCompleted ? "bg-slate-50 border-slate-300" : "bg-white";

  return (
    <section className={["rounded-xl border border-slate-200", sectionClass].join(" ")}>
      <div className="flex w-full items-center justify-between gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{isOpen ? "▼" : "▶"}</span>
            <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
            <p className="text-sm text-slate-500">{tasks.length}</p>
            {isCompleted && (
              <span className="rounded-md bg-green-100 px-2 py-1 text-xs text-green-700">
                Completed
              </span>
            )}
          </div>
        </button>
        <div className="flex items-center gap-2">
          {canDelete && !isCompleted ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkCompleted();
              }}
              className="rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 transition hover:bg-green-200"
            >
              Mark as Completed
            </button>
          ) : null}
          {canDelete && isCompleted ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteProject();
              }}
              className="rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-50 hover:text-red-700"
              aria-label="Delete project"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {tasks.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              No tasks in this project.
            </p>
          ) : (
            tasks.map((task) => (
              <BacklogTaskRow key={task.id} task={task} onDelete={() => onDeleteTask(task.id)} canDelete={canDelete && !isCompleted} />
            ))
          )}
        </div>
      )}
    </section>
  );
}
