import { FileDown, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
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
  onExportTasks?: (columnId: ColumnId) => Promise<void> | void;
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
  onExportTasks,
  onClaimTask,
  canClaim = false,
  canDelete = true,
  canEdit = false,
}: BoardColumnProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const columnAccent: Record<ColumnId, { ring: string; text: string; bg: string }> = {
    todo: { ring: "border-purple-200", text: "text-purple-700", bg: "bg-purple-50/70" },
    inProgress: { ring: "border-blue-200", text: "text-blue-700", bg: "bg-blue-50/70" },
    draftReview: { ring: "border-cyan-200", text: "text-cyan-700", bg: "bg-cyan-50/70" },
    review: { ring: "border-amber-200", text: "text-amber-700", bg: "bg-amber-50/70" },
    done: { ring: "border-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50/70" },
  };

  const columnRing = isDragOver
    ? "border-2 border-dashed border-slate-400 bg-white shadow-md"
    : `border border-slate-200 bg-gradient-to-b from-white to-slate-50 ${columnAccent[columnId].ring}`;
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

  const handleMenuClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleAddTask = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onQuickAddTask?.(columnId);
    setIsMenuOpen(false);
  };

  const handleExportTasks = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void onExportTasks?.(columnId);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen]);

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      className={`group flex w-[290px] shrink-0 flex-col rounded-2xl ${columnRing} p-4 shadow-[0_18px_35px_-30px_rgba(15,23,42,0.45)] transition`}
    >
      <div className="flex items-center justify-between rounded-xl px-2 py-2">
        <div className={`text-xs font-semibold uppercase tracking-[0.35em] ${columnAccent[columnId].text}`}>
          {title}
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${columnAccent[columnId].ring} ${columnAccent[columnId].text} ${columnAccent[columnId].bg}`}>
            {tasks.length}
          </span>
          <div ref={menuRef} className="relative" onClick={handleMenuClick}>
            <button
              type="button"
              aria-label={`${title} actions`}
              aria-expanded={isMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setIsMenuOpen((open) => !open);
              }}
              className="rounded-full border border-gray-200 p-1 transition hover:border-gray-300 hover:bg-white"
            >
              <MoreHorizontal size={14} />
            </button>
            {isMenuOpen ? (
              <div className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg">
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <Plus size={14} />
                  Add Task
                </button>
                <button
                  type="button"
                  onClick={handleExportTasks}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <FileDown size={14} />
                  Export Tasks
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
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
