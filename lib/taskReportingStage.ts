import { COLUMN_COLORS, isColumnColorKey, type ColumnColorKey } from "@/lib/columnColors";

export type ReportingWorkflowStatus =
  | "todo"
  | "in_progress"
  | "draft_review"
  | "in_review"
  | "done"
  | string;

export type ReportingColumn = {
  id: string;
  project_id?: string | null;
  title: string | null;
  sort_order: number | null;
  color_key?: string | null;
  stage_type?: string | null;
  status_key?: string | null;
};

export type ReportingTask = {
  column_id?: string | null;
  status?: string | null;
  project_id?: string | null;
};

export type TaskReportingStage = {
  columnId: string | null;
  stageTitle: string;
  stageColorKey: ColumnColorKey | null;
  stageColor: string;
  stageSortOrder: number | null;
  workflowStatus: string;
  workflowStatusLabel: string;
};

export const REPORT_STAGE_FALLBACK_COLOR = "#64748b";

export const REPORT_STAGE_COLOR_HEX: Record<ColumnColorKey, string> = {
  slate: "#64748b",
  blue: "#2563eb",
  indigo: "#4f46e5",
  purple: "#7c3aed",
  pink: "#db2777",
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  cyan: "#0891b2",
  green: "#16a34a",
};

export function normalizeWorkflowStatus(status: string | null | undefined): string {
  const key = (status ?? "todo").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (key === "review") return "in_review";
  if (key === "draftreview") return "draft_review";
  if (key === "inprogress") return "in_progress";
  if (key === "inreview") return "in_review";
  if (key === "completed") return "done";
  return key || "todo";
}

export function getWorkflowStatusLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    todo: "To Do",
    not_started: "Not Started",
    in_progress: "In Progress",
    draft_review: "Draft Review",
    in_review: "In Review",
    review: "In Review",
    done: "Done",
    completed: "Completed",
    blocked: "Blocked",
  };
  const normalized = normalizeWorkflowStatus(status);
  return map[normalized] ?? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getReportStageColor(colorKey: string | null | undefined): string {
  return isColumnColorKey(colorKey) ? REPORT_STAGE_COLOR_HEX[colorKey] : REPORT_STAGE_FALLBACK_COLOR;
}

export function getReportStageClasses(colorKey: string | null | undefined) {
  if (isColumnColorKey(colorKey)) return COLUMN_COLORS[colorKey];
  return COLUMN_COLORS.slate;
}

export function buildColumnLookup(columns: ReportingColumn[]) {
  return new Map(columns.map((column) => [column.id, column]));
}

export function sortReportingColumns(columns: ReportingColumn[]): ReportingColumn[] {
  return [...columns].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

export function resolveTaskReportingStage(
  task: ReportingTask,
  columnsById: Map<string, ReportingColumn> | ReportingColumn[],
): TaskReportingStage {
  const lookup = Array.isArray(columnsById) ? buildColumnLookup(columnsById) : columnsById;
  const column = task.column_id ? lookup.get(task.column_id) : undefined;
  const workflowStatus = normalizeWorkflowStatus(task.status ?? column?.status_key ?? "todo");
  const stageTitle = column?.title?.trim() || getWorkflowStatusLabel(workflowStatus);
  const stageColorKey = isColumnColorKey(column?.color_key) ? column.color_key : null;

  return {
    columnId: column?.id ?? task.column_id ?? null,
    stageTitle,
    stageColorKey,
    stageColor: getReportStageColor(stageColorKey),
    stageSortOrder: column?.sort_order ?? null,
    workflowStatus,
    workflowStatusLabel: getWorkflowStatusLabel(workflowStatus),
  };
}

export type StageDistributionRow = {
  columnId: string | null;
  label: string;
  count: number;
  color: string;
  sortOrder: number | null;
};

export function computeProjectStageDistribution(tasks: ReportingTask[], columns: ReportingColumn[]): StageDistributionRow[] {
  const sortedColumns = sortReportingColumns(columns);
  const counts = new Map<string, number>();
  const fallbackCounts = new Map<string, number>();
  const columnsById = buildColumnLookup(columns);

  tasks.forEach((task) => {
    if (task.column_id && columnsById.has(task.column_id)) {
      counts.set(task.column_id, (counts.get(task.column_id) ?? 0) + 1);
      return;
    }
    const fallbackLabel = getWorkflowStatusLabel(task.status);
    fallbackCounts.set(fallbackLabel, (fallbackCounts.get(fallbackLabel) ?? 0) + 1);
  });

  return [
    ...sortedColumns.map((column) => ({
      columnId: column.id,
      label: column.title?.trim() || getWorkflowStatusLabel(column.status_key),
      count: counts.get(column.id) ?? 0,
      color: getReportStageColor(column.color_key),
      sortOrder: column.sort_order ?? null,
    })),
    ...Array.from(fallbackCounts.entries()).map(([label, count]) => ({
      columnId: null,
      label,
      count,
      color: REPORT_STAGE_FALLBACK_COLOR,
      sortOrder: null,
    })),
  ];
}
