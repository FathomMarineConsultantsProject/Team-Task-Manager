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

const statusStyles: Record<string, { badge: string; dot: string }> = {
  todo: { badge: "bg-gray-100 text-gray-600", dot: "bg-gray-500" },
  in_progress: { badge: "bg-blue-100 text-blue-600", dot: "bg-blue-500" },
  in_review: { badge: "bg-orange-100 text-orange-600", dot: "bg-orange-500" },
  done: { badge: "bg-green-100 text-green-600", dot: "bg-green-500" },
};

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return "N/A";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function getCompletedInDays(createdAt: string | null, updatedAt: string | null) {
  if (!createdAt || !updatedAt) {
    return null;
  }

  const days = Math.max(
    1,
    Math.floor((new Date(updatedAt).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)),
  );

  return Number.isFinite(days) ? days : null;
}

export default function BacklogTaskRow({ task, onDelete, canDelete }: { task: TaskWithUser; onDelete: () => void; canDelete?: boolean }) {
  const styles = statusStyles[task.status] ?? { badge: "bg-gray-100 text-gray-600", dot: "bg-gray-500" };
  const completedDays = task.status === "done" ? getCompletedInDays(task.created_at, task.updated_at) : null;
  const assigneeText = task.assignedUser?.name ?? task.assignedUser?.email ?? "Unassigned";

  return (
    <div className="flex items-center justify-between px-3 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-150">
      <div className="flex min-w-0 items-center gap-3">
        <div className={["w-2 h-2 rounded-full", styles.dot].join(" ")} />
        <p className="truncate text-base font-medium text-slate-900">{task.title}</p>
      </div>

      <div className="ml-4 flex items-center gap-3 text-sm text-slate-600">
        <span
          className={[
            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
            styles.badge,
          ].join(" ")}
        >
          {formatStatus(task.status)}
        </span>
        <span className="max-w-[180px] truncate text-slate-600">{assigneeText}</span>
        <span className="text-slate-500">{formatDate(task.created_at)}</span>
        {completedDays !== null && <span className="text-green-700">Completed in {completedDays}d</span>}
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded px-2 py-1 text-slate-400 hover:text-red-600 transition-colors"
            aria-label="Delete task"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
