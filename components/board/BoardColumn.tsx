import { Clock3, FileDown, GripVertical, Lock, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import TaskCard from "./TaskCard";
import type { ColumnDateFilter, ColumnId, ColumnSortBy, ColumnViewState, Task } from "./types";
import type { LiveTaskManHoursSummary } from "@/lib/useProjectManHours";
import { COLUMN_COLORS, type ColumnColorKey } from "@/lib/columnColors";

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
  onEditTask?: (taskId: string, target?: "task" | "working-dates") => void;
  onOpenTaskDetails?: (taskId: string, column: ColumnId) => void;
  onQuickAddTask?: (columnId: ColumnId) => void;
  onExportTasks?: (columnId: ColumnId) => Promise<void> | void;
  onClaimTask?: (taskId: string) => Promise<void> | void;
  onMarkReviewed?: (taskId: string) => Promise<void> | void;
  onExtendWorkday?: (taskId: string) => void;
  canExtendWorkday?: (task: Task) => boolean;
  canClaim?: boolean;
  canDelete?: boolean;
  canEdit?: (task: Task) => boolean;
  resetKey?: string;
  taskSummaryById?: Map<string, LiveTaskManHoursSummary>;
  projectTimeZone?: string;
  normalWorkdayEnd?: string;
  // Dynamic column management props
  isLocked?: boolean;
  stageType?: string;
  statusKey?: string;
  canManageColumns?: boolean;
  colorKey?: ColumnColorKey;
  trackManHours?: boolean;
  onEditColumn?: (columnId: ColumnId) => void;
  onDeleteColumn?: (columnId: ColumnId, currentTitle: string, taskCount: number) => void;
  onColumnHeaderDragStart?: (columnId: ColumnId, event: DragEvent<HTMLDivElement>) => void;
  onColumnHeaderDragOver?: (columnId: ColumnId, event: DragEvent<HTMLDivElement>) => void;
  onColumnHeaderDrop?: (columnId: ColumnId, event: DragEvent<HTMLDivElement>) => void;
  onColumnHeaderDragEnd?: () => void;
  isColumnDragOver?: boolean;
  isColumnDragging?: boolean;
  columnViewState?: ColumnViewState;
  onColumnViewStateChange?: (columnId: ColumnId, state: ColumnViewState) => void;
  onColumnViewStateReset?: (columnId: ColumnId) => void;
}

const DEFAULT_VISIBLE_TASKS = 7;

type ColumnSortOption = ColumnSortBy | "default";

const sortOptions: { value: ColumnSortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "ascending", label: "Ascending" },
  { value: "descending", label: "Descending" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "due_date", label: "Due Date" },
  { value: "start_date", label: "Start Date" },
  { value: "near_due", label: "Near Due First" },
  { value: "overdue", label: "Overdue First" },
];

const dateFilterOptions: { value: ColumnDateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Due Today" },
  { value: "tomorrow", label: "Due Tomorrow" },
  { value: "next_3_days", label: "Next 3 Days" },
  { value: "next_7_days", label: "Next 7 Days" },
  { value: "next_14_days", label: "Next 14 Days" },
  { value: "overdue", label: "Overdue" },
  { value: "no_due_date", label: "No Due Date" },
  { value: "completed", label: "Completed" },
];

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
  onMarkReviewed,
  onExtendWorkday,
  canClaim = false,
  canDelete = true,
  canEdit,
  canExtendWorkday,
  resetKey,
  taskSummaryById,
  projectTimeZone,
  normalWorkdayEnd,
  isLocked = false,
  stageType,
  statusKey,
  canManageColumns = false,
  colorKey = "indigo",
  trackManHours = true,
  onEditColumn,
  onDeleteColumn,
  onColumnHeaderDragStart,
  onColumnHeaderDragOver,
  onColumnHeaderDrop,
  onColumnHeaderDragEnd,
  isColumnDragOver = false,
  isColumnDragging = false,
  columnViewState,
  onColumnViewStateChange,
  onColumnViewStateReset,
}: BoardColumnProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [draftViewState, setDraftViewState] = useState<ColumnViewState>({});
  const [showAllTasks, setShowAllTasks] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, DEFAULT_VISIBLE_TASKS);
  const activeViewState = columnViewState ?? {};
  const hasActiveViewState = Boolean(
    activeViewState.sortBy ||
    (activeViewState.dateFilter && activeViewState.dateFilter !== "all"),
  );
  const currentSortBy: ColumnSortOption = draftViewState.sortBy ?? "default";

  useEffect(() => {
    setShowAllTasks(false);
  }, [resetKey]);

  const accent = COLUMN_COLORS[colorKey] ?? COLUMN_COLORS.indigo;

  const columnRing = isColumnDragOver
    ? "border-2 border-blue-500 bg-blue-50/40 shadow-lg ring-2 ring-blue-400/40"
    : isDragOver
      ? "border-2 border-dashed border-slate-400 bg-white shadow-md"
      : `border border-slate-200 bg-gradient-to-b from-white to-slate-50 ${accent.border}`;
  
  const placeholderVisible = isDragOver || tasks.length === 0;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("application/x-column-drag")) {
      onColumnHeaderDragOver?.(columnId, event);
      return;
    }
    onColumnDragOver(columnId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("application/x-column-drag")) {
      onColumnHeaderDrop?.(columnId, event);
      return;
    }
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

  const handleOpenViewMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftViewState({
      sortBy: activeViewState.sortBy,
      dateFilter: activeViewState.dateFilter ?? "all",
    });
    setIsViewMenuOpen((open) => !open);
    setIsMenuOpen(false);
  };

  const handleSortByChange = (sortBy: ColumnSortOption) => {
    setDraftViewState((current) => ({
      ...current,
      sortBy: sortBy === "default" ? undefined : sortBy,
    }));
  };

  const handleApplyViewState = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const sortBy = draftViewState.sortBy;
    onColumnViewStateChange?.(columnId, {
      sortBy,
      dateFilter: draftViewState.dateFilter ?? "all",
    });
    setIsViewMenuOpen(false);
  };

  const handleResetViewState = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftViewState({});
    onColumnViewStateReset?.(columnId);
    setIsViewMenuOpen(false);
  };

  useEffect(() => {
    if (!isMenuOpen && !isViewMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen, isViewMenuOpen]);

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      className={`group flex w-[290px] shrink-0 flex-col rounded-2xl ${columnRing} p-4 shadow-[0_18px_35px_-30px_rgba(15,23,42,0.45)] transition ${
        isColumnDragging ? "opacity-40 scale-[0.98]" : ""
      }`}
    >
      <div className={`relative flex items-center justify-between rounded-xl px-2 py-2 ${accent.tint}`}>
        <span aria-hidden="true" className={`absolute inset-y-1 left-0 w-1 rounded-full ${accent.indicator}`} />
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
          {!isLocked && canManageColumns ? (
            <div
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData("application/x-column-drag", columnId);
                e.dataTransfer.effectAllowed = "move";
                onColumnHeaderDragStart?.(columnId, e);
              }}
              onDragEnd={onColumnHeaderDragEnd}
              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 -ml-1 p-0.5 rounded transition shrink-0"
              title="Drag to reorder column"
            >
              <GripVertical size={16} />
            </div>
          ) : isLocked ? (
            <span title="Locked column" aria-label="Locked column" className="inline-flex shrink-0">
              <Lock size={13} className="mr-0.5 text-slate-400" aria-hidden="true" />
            </span>
          ) : null}
          <div className={`ml-1 text-xs font-semibold uppercase tracking-[0.35em] truncate ${accent.text}`} title={title}>
            {title}
          </div>
          {trackManHours ? <Clock3 size={13} className={`${accent.text} shrink-0 opacity-65`} aria-label="Tracks man-hours" /> : null}
        </div>

        <div className="flex items-center gap-2 text-gray-400 shrink-0">
          <div ref={viewMenuRef} className="relative" onClick={handleMenuClick}>
            <button
              type="button"
              draggable={false}
              aria-label={`${title} sort and filter`}
              aria-expanded={isViewMenuOpen}
              onPointerDown={(event) => event.stopPropagation()}
              onDragStart={(event) => event.preventDefault()}
              onClick={handleOpenViewMenu}
              className={`relative rounded-full border p-1 transition hover:border-gray-300 hover:bg-white ${
                hasActiveViewState ? "border-slate-300 bg-white text-slate-700" : "border-gray-200 text-gray-400"
              }`}
            >
              <SlidersHorizontal size={14} />
              {hasActiveViewState ? (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-slate-700" aria-hidden="true" />
              ) : null}
            </button>
            {isViewMenuOpen ? (
              <div className="absolute right-0 top-8 z-50 w-56 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sort &amp; Filter</div>
                <div className="my-2 border-t border-slate-100" />
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sort by</label>
                <select
                  value={currentSortBy}
                  onChange={(event) => handleSortByChange(event.target.value as ColumnSortOption)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="my-2 border-t border-slate-100" />
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Due</label>
                <select
                  value={draftViewState.dateFilter ?? "all"}
                  onChange={(event) => setDraftViewState((current) => ({ ...current, dateFilter: event.target.value as ColumnDateFilter }))}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {dateFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="mt-3 flex items-center justify-between">
                  <button type="button" onClick={handleResetViewState} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                    Reset
                  </button>
                  <button type="button" onClick={handleApplyViewState} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${accent.border} ${accent.text} ${accent.tint}`}>
            {tasks.length}
          </span>
          <div ref={menuRef} className="relative" onClick={handleMenuClick}>
            <button
              type="button"
              draggable={false}
              aria-label={`${title} actions`}
              aria-expanded={isMenuOpen}
              onPointerDown={(event) => event.stopPropagation()}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                setIsMenuOpen((open) => !open);
              }}
              className="rounded-full border border-gray-200 p-1 transition hover:border-gray-300 hover:bg-white"
            >
              <MoreHorizontal size={14} />
            </button>
            {isMenuOpen ? (
              <div className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg">
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
                {canManageColumns ? (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onEditColumn?.(columnId);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50 text-slate-700"
                    >
                      <Pencil size={14} />
                      Edit Column
                    </button>
                    {!isLocked ? <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onDeleteColumn?.(columnId, title, tasks.length);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-red-50 text-red-600"
                    >
                      <Trash2 size={14} />
                      Delete Column
                    </button> : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-3">
        {visibleTasks.map((task) => (
          <TaskCard
            key={task.id}
            {...task}
            columnId={columnId}
            stageType={stageType}
            statusKey={statusKey}
            onRemoveTask={onRemoveTask}
            onDeleteTask={onDeleteTask}
            onEditTask={onEditTask}
            onOpenDetails={() => onOpenTaskDetails?.(task.id, columnId)}
            onClaimTask={onClaimTask}
            onMarkReviewed={onMarkReviewed}
            onExtendWorkday={onExtendWorkday}
            canClaim={canClaim}
            canDelete={canDelete}
            canEdit={canEdit?.(task) ?? false}
            canExtendWorkday={canExtendWorkday?.(task) ?? false}
            manHoursSummary={taskSummaryById?.get(task.id)}
            projectTimeZone={projectTimeZone}
            normalWorkdayEnd={normalWorkdayEnd}
            onDragStart={(event) => onTaskDragStart(task.id, columnId, event)}
            onDragEnd={onTaskDragEnd}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
            No tasks in this column
          </div>
        ) : null}
        {tasks.length > DEFAULT_VISIBLE_TASKS ? (
          <button
            type="button"
            aria-expanded={showAllTasks}
            onClick={() => setShowAllTasks((current) => !current)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {showAllTasks ? "Show less" : `Show more (${tasks.length - DEFAULT_VISIBLE_TASKS})`}
          </button>
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
