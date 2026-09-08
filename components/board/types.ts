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

export type TaskUpdateSummary = {
  id: string;
  taskId: string;
  userName: string;
  content: string;
  createdAt: string;
};
