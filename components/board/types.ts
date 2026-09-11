export type ColumnId = string;

export interface BoardColumnDefinition {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  stage_type: "todo" | "in_progress" | "draft_review" | "in_review" | "done" | "custom" | string;
  status_key: "todo" | "in_progress" | "draft_review" | "in_review" | "done";
  is_locked: boolean;
  color_key: import("@/lib/columnColors").ColumnColorKey;
  track_man_hours: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TaskDirection = "up" | "down" | "right";

export type TaskReviewProgress = {
  total: number;
  reviewed: number;
  pending: number;
  currentUserStatus: "pending" | "reviewed" | null;
};

export type Task = {
  title: string;
  id: string;
  column_id?: string | null;
  status?: string | null;
  progress?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  draft_review_started_at?: string | null;
  draft_review_due_at?: string | null;
  direction?: TaskDirection;
  initials?: string;
  statusLabel?: string;
  accent?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeRole?: string | null;
  avatarUrl?: string | null;
  canDrag?: boolean;
  updatesCount?: number;
  reviewProgress?: TaskReviewProgress;
  assignees?: { id: string; name: string | null; email: string | null; avatar_url?: string | null }[];
};

export type ColumnTaskMap = Record<string, Task[] | undefined>;

export type ColumnSortBy =
  | "ascending"
  | "descending"
  | "alphabetical"
  | "due_date"
  | "start_date"
  | "near_due"
  | "overdue";

export type ColumnSortDirection = "asc" | "desc";

export type ColumnDateFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "next_3_days"
  | "next_7_days"
  | "next_14_days"
  | "overdue"
  | "no_due_date"
  | "completed";

export interface ColumnViewState {
  sortBy?: ColumnSortBy;
  dateFilter?: ColumnDateFilter;
}

export type BoardColumnViewState = Record<string, ColumnViewState>;

export function getColumnTasks(columns: ColumnTaskMap, columnId: string): Task[] {
  return columns[columnId] ?? [];
}

export function initializeColumnTaskMap(projectColumns: BoardColumnDefinition[]): ColumnTaskMap {
  return Object.fromEntries(projectColumns.map((column) => [column.id, []]));
}

export type TaskUpdateSummary = {
  id: string;
  taskId: string;
  userName: string;
  content: string;
  createdAt: string;
};
