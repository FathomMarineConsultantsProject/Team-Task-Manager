import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Clock, MessageSquare, MoreHorizontal } from "lucide-react";
import type { ColumnId, Task } from "./types";
import Avatar from "@/components/ui/Avatar";

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

const STATUS_TONES: Record<string, { border: string; glow: string; pill: string }> = {
  not_started: { border: "#a78bfa", glow: "rgba(167, 139, 250, 0.25)", pill: "bg-purple-50 text-purple-700" },
  in_progress: { border: "#3b82f6", glow: "rgba(59, 130, 246, 0.25)", pill: "bg-blue-50 text-blue-700" },
  near_due: { border: "#f59e0b", glow: "rgba(245, 158, 11, 0.25)", pill: "bg-amber-50 text-amber-700" },
  completed: { border: "#22c55e", glow: "rgba(34, 197, 94, 0.25)", pill: "bg-emerald-50 text-emerald-700" },
  done_early: { border: "#06b6d4", glow: "rgba(6, 182, 212, 0.25)", pill: "bg-cyan-50 text-cyan-700" },
  overdue: { border: "#ef4444", glow: "rgba(239, 68, 68, 0.25)", pill: "bg-red-50 text-red-700" },
};

const resolveTone = (columnId: ColumnId, dueState: "overdue" | "near" | "on_track" | null) => {
  if (dueState === "overdue") return STATUS_TONES.overdue;
  if (dueState === "near") return STATUS_TONES.near_due;
  if (columnId === "done") return STATUS_TONES.completed;
  if (columnId === "todo") return STATUS_TONES.not_started;
  if (columnId === "inProgress") return STATUS_TONES.in_progress;
  return STATUS_TONES.in_progress;
};

const formatDueDelta = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export default function TaskCard({ columnId, onOpenDetails, onRemoveTask, onDeleteTask, onEditTask, onClaimTask, canClaim = false, canDelete = true, canEdit = false, onDragStart, onDragEnd, ...task }: TaskCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canDrag = task.canDrag ?? false;
  const now = Date.now();
  const isFutureTask = task.start_date && new Date(task.start_date) > new Date();
  const dueAt = task.end_date ? new Date(task.end_date).getTime() : null;
  const isOverdue = dueAt !== null && dueAt < now && columnId !== "done";
  const isNearDue = dueAt !== null && !isOverdue && (dueAt - now) <= 3 * 24 * 60 * 60 * 1000 && columnId !== "done";
  const dueState: "overdue" | "near" | "on_track" | null = isOverdue ? "overdue" : isNearDue ? "near" : dueAt ? "on_track" : null;
  const dueDelta = dueAt ? formatDueDelta(Math.abs(dueAt - now)) : null;
  const dueDateLabel = task.end_date
    ? new Date(task.end_date).toLocaleDateString(undefined, { month: "short", day: "2-digit" })
    : null;
  const tone = resolveTone(columnId, dueState);

  const baseClasses = "select-none rounded-2xl border bg-white/90 p-4 shadow-[0_10px_25px_-20px_rgba(15,23,42,0.4)] transition-all duration-200";
  const interactionClasses = canDrag ? "cursor-grab active:cursor-grabbing" : isFutureTask ? "cursor-not-allowed" : "cursor-default";
  const futureTaskClasses = isFutureTask ? "opacity-50" : "";
  const stateClasses = isRemoving
    ? "opacity-0 scale-95"
    : canDrag
      ? "hover:-translate-y-0.5 hover:shadow-[0_16px_28px_-18px_rgba(15,23,42,0.55)]"
      : "";
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
  const commentCount = task.updatesCount ?? 0;

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
      className={`${baseClasses} ${interactionClasses} ${futureTaskClasses} ${stateClasses} border-l-4`.trim()}
      style={{ borderLeftColor: tone.border, boxShadow: `0 12px 28px -24px ${tone.glow}` }}
      title={isFutureTask && !canDrag ? "Task cannot be moved until start date" : undefined}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold leading-snug text-gray-900 break-words line-clamp-2">{task.title}</h3>
            {dueDateLabel ? (
              <p className="mt-1 text-[11px] font-medium text-slate-400">Due {dueDateLabel}</p>
            ) : null}
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dueAt ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.pill}`}>
              <Clock size={11} />
              {isOverdue ? `overdue by ${dueDelta}` : `due in ${dueDelta}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              <Clock size={11} />
              No due date
            </span>
          )}
          {task.start_date ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Starts {task.start_date}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {task.assignees && task.assignees.length > 0 ? (
              <>
                <div
                  className="flex items-center -space-x-2"
                  title={task.assignees.map(a => a.name ?? a.email ?? "").filter(Boolean).join(", ")}
                >
                  {task.assignees.slice(0, 2).map((user) => (
                    <Avatar
                      key={user.id}
                      userId={user.id}
                      name={user.name}
                      email={user.email}
                      avatarUrl={user.avatar_url}
                      size="xs"
                      className="border-2 border-white"
                    />
                  ))}
                  {task.assignees.length > 2 && (
                    <div className="h-6 w-6 rounded-full bg-slate-200 text-[10px] flex items-center justify-center border-2 border-white text-slate-600 font-medium">
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
                <Avatar
                  userId={task.assigneeId ?? undefined}
                  name={task.assigneeName}
                  email={task.assigneeEmail}
                  avatarUrl={task.avatarUrl}
                  size="xs"
                />
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
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            <MessageSquare size={12} />
            {commentCount}
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
