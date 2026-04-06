export type ColumnId = "todo" | "inProgress" | "review" | "done";

export type TaskDirection = "up" | "down" | "right";

export type Task = {
  title: string;
  id: string;
  direction?: TaskDirection;
  initials?: string;
  statusLabel?: string;
  accent?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeRole?: string | null;
  canDrag?: boolean;
  updatesCount?: number;
};

export type TaskUpdateSummary = {
  id: string;
  taskId: string;
  userName: string;
  content: string;
  createdAt: string;
};
