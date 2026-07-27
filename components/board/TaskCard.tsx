import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Clock, MessageSquare, MoreHorizontal } from "lucide-react";
import type { ColumnId, Task } from "./types";
import Avatar from "@/components/ui/Avatar";
import { workingDaysUntil } from "@/lib/workingDays";
import { formatDuration } from "@/lib/manHours";
import type { LiveTaskManHoursSummary } from "@/lib/useProjectManHours";
import {
  DEFAULT_PROJECT_TIME_ZONE,
  DEFAULT_PROJECT_WORKDAY_END,
  formatProjectDate,
  getProjectLocalDate,
  getTaskDueState,
} from "@/lib/projectDateTime";

interface TaskCardProps extends Task {
  columnId: ColumnId;
  onOpenDetails?: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRemoveTask: (taskId: string, column: ColumnId) => void;
  onDeleteTask: (taskId: string, column: ColumnId) => Promise<void> | void;
  onEditTask?: (taskId: string) => void;
  onClaimTask?: (taskId: string) => Promise<void> | void;
  onMarkReviewed?: (taskId: string) => Promise<void> | void;
  onExtendWorkday?: (taskId: string) => void;
  canClaim?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  canExtendWorkday?: boolean;
  manHoursSummary?: LiveTaskManHoursSummary;
  projectTimeZone?: string;
  normalWorkdayEnd?: string;
}

const STATUS_TONES: Record<string, { border: string; glow: string; pill: string }> = {
  not_started: { border: "#a78bfa", glow: "rgba(167, 139, 250, 0.25)", pill: "bg-purple-50 text-purple-700" },
  in_progress: { border: "#3b82f6", glow: "rgba(59, 130, 246, 0.25)", pill: "bg-blue-50 text-blue-700" },
  draft_review: { border: "#06b6d4", glow: "rgba(6, 182, 212, 0.25)", pill: "bg-cyan-50 text-cyan-700" },
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
  if (columnId === "draftReview") return STATUS_TONES.draft_review;
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

const formatLocalTime = (value: string) => {
  const [hourValue, minute = "00"] = value.split(":");
  const hour = Number(hourValue);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
};

export default function TaskCard({ columnId, onOpenDetails, onRemoveTask, onDeleteTask, onEditTask, onClaimTask, onMarkReviewed, onExtendWorkday, canClaim = false, canDelete = true, canEdit = false, canExtendWorkday = false, manHoursSummary, projectTimeZone = DEFAULT_PROJECT_TIME_ZONE, normalWorkdayEnd = DEFAULT_PROJECT_WORKDAY_END, onDragStart, onDragEnd, ...task }: TaskCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isMarkingReviewed, setIsMarkingReviewed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canDrag = task.canDrag ?? false;
  const nowDate = new Date();
  const now = nowDate.getTime();
  const isFutureTask = Boolean(task.start_date && task.start_date > getProjectLocalDate(projectTimeZone, nowDate));
  const reviewDueAt = columnId === "draftReview" && task.draft_review_due_at
    ? new Date(task.draft_review_due_at).getTime()
    : null;
  const taskDue = getTaskDueState({
    dueDate: task.end_date,
    completedAt: columnId === "done" ? task.completed_at ?? nowDate.toISOString() : null,
    now: nowDate,
    timeZone: projectTimeZone,
    workdayEnd: normalWorkdayEnd,
  });
  const dueAt = reviewDueAt ?? taskDue.effectiveDueAt?.getTime() ?? null;
  const isOverdue = reviewDueAt !== null
    ? reviewDueAt < now && columnId !== "done"
    : taskDue.state === "overdue" && columnId !== "done";
  const isNearDue = dueAt !== null && !isOverdue && (dueAt - now) <= 3 * 24 * 60 * 60 * 1000 && columnId !== "done";
  const dueState: "overdue" | "near" | "on_track" | null = isOverdue ? "overdue" : isNearDue ? "near" : dueAt ? "on_track" : null;
  const dueDelta = dueAt ? formatDueDelta(Math.abs(dueAt - now)) : null;
  const dueDateLabel = task.end_date
    ? formatProjectDate(task.end_date, projectTimeZone, { month: "short", day: "2-digit" })
    : null;
  const reviewDueDateLabel = task.draft_review_due_at
    ? new Date(task.draft_review_due_at).toLocaleDateString(undefined, { month: "short", day: "2-digit" })
    : null;
  const reviewWorkingDays = task.draft_review_due_at
    ? workingDaysUntil(new Date(task.draft_review_due_at))
    : null;
  const reviewDueText = reviewWorkingDays === null
    ? null
    : reviewWorkingDays < 0
      ? `Review overdue by ${Math.abs(reviewWorkingDays)} working ${Math.abs(reviewWorkingDays) === 1 ? "day" : "days"}`
      : `Review due in ${reviewWorkingDays} working ${reviewWorkingDays === 1 ? "day" : "days"}`;
  const tone = resolveTone(columnId, dueState);
  const dueChipText = columnId === "done"
    ? "Completed"
    : reviewDueText
      ?? (isOverdue
        ? `overdue by ${dueDelta}`
        : taskDue.state === "due_today" && reviewDueAt === null
          ? "Due today"
          : `due in ${dueDelta}`);

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
  const reviewProgress = columnId === "review" ? task.reviewProgress : undefined;
  const showReviewBadge = Boolean(reviewProgress && reviewProgress.total > 0);
  const reviewBadgeText = reviewProgress
    ? reviewProgress.pending > 1
      ? `${reviewProgress.pending} reviews left`
      : reviewProgress.pending === 1
        ? "1 review left"
        : "Reviewed"
    : null;
  const canMarkReviewed = Boolean(
    columnId === "review" &&
      reviewProgress &&
      reviewProgress.currentUserStatus === "pending" &&
      onMarkReviewed,
  );

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

  const handleMarkReviewed = async () => {
    if (!canMarkReviewed || !onMarkReviewed || isMarkingReviewed) return;
    setIsMarkingReviewed(true);
    try {
      await onMarkReviewed(task.id);
      setShowMenu(false);
    } finally {
      setIsMarkingReviewed(false);
    }
  };

  const isActiveWorkStatus = columnId === "inProgress" || columnId === "draftReview" || columnId === "review";
  const showExtendAction = isActiveWorkStatus && canExtendWorkday && Boolean(onExtendWorkday);
  const showContextMenu = canEdit || canDelete || canMarkReviewed || showExtendAction;
  const extendDisabledReason = manHoursSummary?.scheduleState === "legacy"
    ? "Configure working dates first"
    : manHoursSummary && !manHoursSummary.todayIsSelected
      ? "Today is not a selected working date."
      : null;
  const manHoursTooltip = manHoursSummary?.scheduleState === "legacy"
    ? "Legacy continuous tracking; configure a working schedule"
    : !manHoursSummary?.todayIsSelected
      ? "Off day — man-hours are not accumulating"
      : manHoursSummary?.isAccumulating
        ? `Running until ${formatLocalTime(manHoursSummary.effectiveEndLocalTime)}`
        : manHoursSummary?.todayHasExtension
          ? `Extended until ${formatLocalTime(manHoursSummary.effectiveEndLocalTime)}`
          : "Outside working hours";

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
                  className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
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
                  {canMarkReviewed && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleMarkReviewed();
                      }}
                      disabled={isMarkingReviewed}
                      className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {isMarkingReviewed ? "Saving..." : "Mark as Reviewed"}
                    </button>
                  )}
                  {showExtendAction ? (
                    <button
                      type="button"
                      disabled={Boolean(extendDisabledReason)}
                      title={extendDisabledReason ?? undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (extendDisabledReason) return;
                        setShowMenu(false);
                        onExtendWorkday?.(task.id);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {extendDisabledReason ?? (manHoursSummary?.todayHasExtension ? "Update Today’s Extension" : "Extend Today’s Work Hours")}
                    </button>
                  ) : null}
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
              {dueChipText}
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
          {columnId === "draftReview" && reviewDueDateLabel ? (
            <span className="inline-flex items-center rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
              Review due {reviewDueDateLabel}
            </span>
          ) : null}
          {showReviewBadge && reviewBadgeText ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${reviewProgress?.pending === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {reviewBadgeText}
            </span>
          ) : null}
          {manHoursSummary?.trackingState === "tracked" ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
              title={manHoursTooltip}
            >
              <Clock size={11} />
              MH {formatDuration(manHoursSummary.liveTotalManHoursSeconds)}
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
