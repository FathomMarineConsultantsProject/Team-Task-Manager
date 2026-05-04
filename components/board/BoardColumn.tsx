import { Plus } from "lucide-react";
import type { DragEvent } from "react";
import TaskCard from "./TaskCard";
import type { ColumnId, Task } from "./types";

interface BoardColumnProps {
  columnId: ColumnId;
  title: string;
  tasks: Task[];
  isDragOver: boolean;
  onColumnDragOver: (columnId: ColumnId | null) => void;
  onColumnDrop: (columnId: ColumnId) => void;
  onTaskDragStart: (taskId: string, from: ColumnId, event: DragEvent<HTMLDivElement>) => void;
  onTaskDragEnd: () => void;
  onRemoveTask: (taskId: string, column: ColumnId) => void;
  onDeleteTask: (taskId: string, column: ColumnId) => Promise<void> | void;
  onEditTask?: (taskId: string) => void;
  onOpenTaskDetails?: (taskId: string, column: ColumnId) => void;
  onQuickAddTask?: (columnId: ColumnId) => void;
  onClaimTask?: (taskId: string) => Promise<void> | void;
  canClaim?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
}

export default function BoardColumn({
  columnId,
  title,
  tasks,
  isDragOver,
  onColumnDragOver,
  onColumnDrop,
  onTaskDragStart,
  onTaskDragEnd,
  onRemoveTask,
  onDeleteTask,
  onEditTask,
  onOpenTaskDetails,
  onQuickAddTask,
  onClaimTask,
  canClaim = false,
  canDelete = true,
  canEdit = false,
}: BoardColumnProps) {
  const columnRing = isDragOver
    ? "border-2 border-dashed border-slate-400 bg-white shadow-md"
    : "border border-gray-200 bg-slate-50";
  const placeholderVisible = isDragOver || tasks.length === 0;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onColumnDragOver(columnId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onColumnDrop(columnId);
    onColumnDragOver(null);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      onColumnDragOver(null);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      className={`group flex w-[280px] shrink-0 flex-col rounded-xl ${columnRing} p-5 shadow-sm transition`}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.4em] text-gray-500">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="flex items-center gap-3 text-gray-400">
          <span className="rounded-full border border-gray-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500">
            {tasks.length}
          </span>
          <button
            type="button"
            onClick={() => onQuickAddTask?.(columnId)}
            className="rounded-full border border-gray-200 p-1 transition hover:border-gray-300 hover:bg-white"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="mt-6 flex flex-1 flex-col gap-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            {...task}
            columnId={columnId}
            onRemoveTask={onRemoveTask}
            onDeleteTask={onDeleteTask}
            onEditTask={onEditTask}
            onOpenDetails={() => onOpenTaskDetails?.(task.id, columnId)}
            onClaimTask={onClaimTask}
            canClaim={canClaim}
            canDelete={canDelete}
            canEdit={canEdit}
            onDragStart={(event) => onTaskDragStart(task.id, columnId, event)}
            onDragEnd={onTaskDragEnd}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
            No tasks in this column
          </div>
        ) : null}
        <div
          className={`drag-placeholder mt-2 rounded-xl border-2 border-dashed px-4 py-3 text-center text-xs transition ${
            placeholderVisible
              ? "border-slate-400 text-slate-500 opacity-100"
              : "border-gray-300/80 text-gray-400 opacity-0 group-hover:opacity-100"
          }`}
        >
          Drop cards here
        </div>
      </div>
    </div>
  );
}
