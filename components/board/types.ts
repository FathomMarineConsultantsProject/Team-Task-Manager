export type ColumnId = "todo" | "inProgress" | "draftReview" | "review" | "done";

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
