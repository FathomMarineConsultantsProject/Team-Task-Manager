import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ColumnId, Task } from "./types";

const DEFAULT_ACCENT = "bg-slate-400";

interface TaskCardProps extends Task {
  columnId: ColumnId;
  onOpenDetails?: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRemoveTask: (taskId: string, column: ColumnId) => void;
  onDeleteTask: (taskId: string, column: ColumnId) => Promise<void> | void;
  onEditTask?: (taskId: string) => void;
  onClaimTask?: (taskId: string) => Promise<void> | void;
  canClaim?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
}

export default function TaskCard({ columnId, onOpenDetails, onRemoveTask, onDeleteTask, onEditTask, onClaimTask, canClaim = false, canDelete = true, canEdit = false, onDragStart, onDragEnd, ...task }: TaskCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canDrag = task.canDrag ?? false;
  const isFutureTask = task.start_date && new Date(task.start_date) > new Date();
  const baseClasses = "select-none rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200";
  const interactionClasses = canDrag ? "cursor-grab active:cursor-grabbing" : isFutureTask ? "cursor-not-allowed" : "cursor-default";
  const futureTaskClasses = isFutureTask ? "opacity-50" : "";
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

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

  const showContextMenu = canEdit || canDelete;

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
      onClick={() => onOpenDetails?.()}
      className={`${baseClasses} ${interactionClasses} ${futureTaskClasses} ${stateClasses}`.trim()}
      title={isFutureTask && !canDrag ? "Task cannot be moved until start date" : undefined}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 break-words line-clamp-2">{task.title}</h3>
          </div>
          {showContextMenu && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowMenu((prev) => !prev);
                }}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                  onClick={(event) => event.stopPropagation()}
                >
                  {canEdit && onEditTask && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowMenu(false);
                        onEditTask(task.id);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowMenu(false);
                        void onDeleteTask(task.id, columnId);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-red-500 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
            {task.assignees && task.assignees.length > 0 ? (
              <>
                <div
                  className="flex items-center -space-x-2"
                  title={task.assignees.map(a => a.name ?? a.email ?? "").filter(Boolean).join(", ")}
                >
                  {task.assignees.slice(0, 2).map((user) => {
                    const initials =
                      user.name?.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() ?? "--";
                    return (
                      <div
                        key={user.id}
                        className="h-7 w-7 rounded-full bg-slate-400 text-white text-xs flex items-center justify-center border-2 border-white"
                        title={user.name ?? user.email ?? ""}
                      >
                        {initials}
                      </div>
                    );
                  })}
                  {task.assignees.length > 2 && (
                    <div className="h-7 w-7 rounded-full bg-slate-200 text-xs flex items-center justify-center border-2 border-white text-slate-600 font-medium">
                      +{task.assignees.length - 2}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  {task.assignees.length === 1
                    ? (task.assignees[0].name ?? "Unknown")
                    : `${task.assignees[0].name ?? "Unknown"} +${task.assignees.length - 1}`}
                </p>
              </>
            ) : (
              <>
                {avatarLabel ? (
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ${avatarAccent}`}>
                    {avatarLabel}
                  </div>
                ) : (
                  <div className="h-7 w-7 rounded-full border border-dashed border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center justify-center">
                    --
                  </div>
                )}
                <p className="text-xs text-gray-600">{assigneeDisplay}</p>
              </>
            )}
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
