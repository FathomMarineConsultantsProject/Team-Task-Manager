/**
 * Report-specific status derivation for executive analytics.
 *
 * Derives status from actual task data (start_date, end_date, completed_at, status)
 * rather than just the DB status column. This provides richer insight for reports.
 *
 * IMPORTANT: This does NOT modify the board/roadmap status system (statusConfig.ts).
 * It's a reporting-only layer that sits on top of the base status.
 */

import { normalizeStatus } from "./statusConfig";

// ── Report Status Keys ──────────────────────────────

export type ReportStatusKey =
  | "not_started"
  | "in_progress"
  | "draft_review"
  | "near_due"
  | "done_early"
  | "completed"
  | "overdue";

export type ReportStatusConfig = {
  key: ReportStatusKey;
  label: string;
  color: string;      // hex for charts/badges
  bg: string;          // tailwind bg class
  text: string;        // tailwind text class
  border: string;      // tailwind border class
};

export const REPORT_STATUS: Record<ReportStatusKey, ReportStatusConfig> = {
  not_started: {
    key: "not_started",
    label: "Not Started",
    color: "#a78bfa",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-300",
  },
  in_progress: {
    key: "in_progress",
    label: "In Progress",
    color: "#3b82f6",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-300",
  },
  draft_review: {
    key: "draft_review",
    label: "Draft Review",
    color: "#06b6d4",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-300",
  },
  near_due: {
    key: "near_due",
    label: "Near Due",
    color: "#f59e0b",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
  },
  done_early: {
    key: "done_early",
    label: "Done Early",
    color: "#06b6d4",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-300",
  },
  completed: {
    key: "completed",
    label: "Completed",
    color: "#22c55e",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-300",
  },
  overdue: {
    key: "overdue",
    label: "Overdue",
    color: "#ef4444",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
  },
};

export const REPORT_STATUS_KEYS: ReportStatusKey[] = [
  "not_started",
  "in_progress",
  "draft_review",
  "near_due",
  "done_early",
  "completed",
  "overdue",
];

// ── Derive Report Status ────────────────────────────

export type ReportTask = {
  id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  project_id?: string;
  title?: string;
};

const NEAR_DUE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Derive the report display status from actual task timestamps.
 * Priority order matters: overdue > near_due > done_early > completed > in_progress > not_started
 */
export function deriveReportStatus(task: ReportTask): ReportStatusKey {
  const baseStatus = normalizeStatus(task.status);
  const now = new Date();
  const endDate = task.end_date ? new Date(task.end_date) : null;
  const completedAt = task.completed_at ? new Date(task.completed_at) : null;

  // Completed tasks
  if (baseStatus === "done" || completedAt) {
    if (endDate && completedAt && completedAt < endDate) {
      return "done_early";
    }
    return "completed";
  }

  // Overdue: past due date and not done
  if (endDate && endDate < now) {
    return "overdue";
  }

  // Near due: within 48h of due date
  if (endDate) {
    const remaining = endDate.getTime() - now.getTime();
    if (remaining > 0 && remaining <= NEAR_DUE_THRESHOLD_MS) {
      return "near_due";
    }
  }

  // In progress (includes in_review)
  if (baseStatus === "draft_review") {
    return "draft_review";
  }

  if (baseStatus === "in_progress" || baseStatus === "in_review") {
    return "in_progress";
  }

  // Not started
  return "not_started";
}

// ── Time Difference Formatting ──────────────────────

/**
 * Format a time difference as "Xd Xh" human-readable string.
 * Positive diff = early/remaining, negative = overdue.
 */
export function formatTimeDiff(ms: number): string {
  const absMs = Math.abs(ms);
  const totalHours = Math.floor(absMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(absMs / (1000 * 60));
  return `${mins}m`;
}

/**
 * Get the display timer text for a task based on its report status.
 */
export function getTaskTimerLabel(task: ReportTask): string | null {
  const status = deriveReportStatus(task);
  const now = new Date();
  const endDate = task.end_date ? new Date(task.end_date) : null;
  const completedAt = task.completed_at ? new Date(task.completed_at) : null;

  switch (status) {
    case "done_early": {
      if (!endDate || !completedAt) return null;
      const diff = endDate.getTime() - completedAt.getTime();
      return `${formatTimeDiff(diff)} early`;
    }
    case "near_due": {
      if (!endDate) return null;
      const remaining = endDate.getTime() - now.getTime();
      return `${formatTimeDiff(remaining)} remaining`;
    }
    case "overdue": {
      if (!endDate) return null;
      const overdue = now.getTime() - endDate.getTime();
      return `overdue by ${formatTimeDiff(overdue)}`;
    }
    default:
      return null;
  }
}

// ── Report-level aggregations ───────────────────────

export type ReportKPIs = {
  total: number;
  notStarted: number;
  inProgress: number;
  draftReview: number;
  nearDue: number;
  doneEarly: number;
  completed: number;
  overdue: number;
  completionRate: number;
};

export function computeReportKPIs(tasks: ReportTask[]): ReportKPIs {
  const counts: Record<ReportStatusKey, number> = {
    not_started: 0,
    in_progress: 0,
    draft_review: 0,
    near_due: 0,
    done_early: 0,
    completed: 0,
    overdue: 0,
  };

  for (const t of tasks) {
    counts[deriveReportStatus(t)]++;
  }

  const total = tasks.length;
  const done = counts.done_early + counts.completed;

  return {
    total,
    notStarted: counts.not_started,
    inProgress: counts.in_progress,
    draftReview: counts.draft_review,
    nearDue: counts.near_due,
    doneEarly: counts.done_early,
    completed: counts.completed,
    overdue: counts.overdue,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

export type ReportStatusDistribution = {
  key: ReportStatusKey;
  label: string;
  count: number;
  color: string;
};

export function computeReportStatusDistribution(tasks: ReportTask[]): ReportStatusDistribution[] {
  const counts: Record<ReportStatusKey, number> = {
    not_started: 0,
    in_progress: 0,
    draft_review: 0,
    near_due: 0,
    done_early: 0,
    completed: 0,
    overdue: 0,
  };

  for (const t of tasks) {
    counts[deriveReportStatus(t)]++;
  }

  return REPORT_STATUS_KEYS.map((key) => ({
    key,
    label: REPORT_STATUS[key].label,
    count: counts[key],
    color: REPORT_STATUS[key].color,
  }));
}
