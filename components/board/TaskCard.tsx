import { useState } from "react";
import type { DragEvent } from "react";
import type { ColumnId, Task } from "./types";

const DEFAULT_ACCENT = "bg-slate-400";

interface TaskCardProps extends Task {
  columnId: ColumnId;
  onOpenDetails?: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRemoveTask: (taskId: string, column: ColumnId) => void;
  onDeleteTask: (taskId: string, column: ColumnId) => Promise<void> | void;
  onClaimTask?: (taskId: string) => Promise<void> | void;
  canClaim?: boolean;
  canDelete?: boolean;
}

export default function TaskCard({ columnId, onOpenDetails, onRemoveTask, onDeleteTask, onClaimTask, canClaim = false, canDelete = true, onDragStart, onDragEnd, ...task }: TaskCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const canDrag = task.canDrag ?? false;
  const isFutureTask = task.start_date && new Date(task.start_date) > new Date();
  const baseClasses = "select-none rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 cursor-default";
  const interactionClasses = canDrag ? "active:cursor-grabbing" : "";
  const futureTaskClasses = isFutureTask ? "opacity-50 pointer-events-none" : "";
  const stateClasses = isRemoving
    ? "opacity-0 scale-95"
    : canDrag
      ? "hover:scale-[0.98] hover:border-gray-300 hover:shadow-md"
      : "";
  const avatarAccent = task.accent ?? DEFAULT_ACCENT;
  const primaryName = task.assigneeName?.trim();
  const secondaryName = task.assigneeEmail?.split("@")[0];
  const formattedInitials = task.initials?.trim().toUpperCase();
  const fallbackInitials =
    (primaryName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") ?? "") ||
    secondaryName?.slice(0, 2).toUpperCase() ||
    "--";
  const avatarLabel =
    (formattedInitials && formattedInitials.length > 0 ? formattedInitials.slice(0, 2) : null) ?? fallbackInitials;
  const assigneeDisplay =
    primaryName ||
    secondaryName ||
    task.initials?.toUpperCase() ||
    task.assigneeId ||
    "Unassigned";
  const isUnassigned = !task.assigneeId;

  const handleDragStartInternal = (event: DragEvent<HTMLDivElement>) => {
    if (!canDrag) {
      event.preventDefault();
      return;
    }
    onDragStart(event);
  };

  const handleDragEndInternal = () => {
    if (!canDrag) {
      return;
    }
    onDragEnd();
  };

  const handleComplete = () => {
    if (columnId !== "done" || isRemoving) {
      return;
    }

    if (!window.confirm("Mark this task as completed?")) {
      return;
    }

    setIsRemoving(true);

    setTimeout(() => {
      onRemoveTask(task.id, columnId);
    }, 200);
  };

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
      onClick={() => onOpenDetails?.()}
      className={`${baseClasses} ${interactionClasses} ${futureTaskClasses} ${stateClasses}`.trim()}
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
        {task.start_date ? (
          <p className="mt-1 text-xs text-gray-500">Starts on: {task.start_date}</p>
        ) : null}
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {task.statusLabel ?? "TODO"}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarLabel ? (
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ${avatarAccent}`}>
                {avatarLabel}
              </div>
            ) : (
              <div className="h-7 w-7 rounded-full border border-dashed border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center justify-center">
                --
              </div>
            )}
            <span className="text-sm font-medium text-gray-700">{assigneeDisplay}</span>
            {isUnassigned && onClaimTask ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onClaimTask(task.id);
                }}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Claim
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteTask(task.id, columnId);
                }}
                className="cursor-pointer rounded-md px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
      {columnId === "done" && canDelete ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleComplete();
            }}
            disabled={isRemoving}
            className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Mark as Completed
          </button>
        </div>
      ) : null}
    </div>
  );
}
