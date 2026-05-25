/**
 * Unified status color configuration used across Board, Roadmap, Spreadsheet, and Reports.
 * Single source of truth — never duplicate status styles elsewhere.
 */

export type StatusKey = "todo" | "in_progress" | "in_review" | "done";

export type StatusConfig = {
  label: string;
  bg: string;
  text: string;
  border: string;
  badge: string;
  dot: string;
  barColor: string; // hex for Recharts
};

export const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  todo: {
    label: "TODO",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-l-slate-400",
    badge: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    barColor: "#94a3b8",
  },
  in_progress: {
    label: "IN PROGRESS",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-l-amber-500",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    barColor: "#f59e0b",
  },
  in_review: {
    label: "IN REVIEW",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-l-indigo-500",
    badge: "bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-500",
    barColor: "#6366f1",
  },
  done: {
    label: "DONE",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-l-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    barColor: "#10b981",
  },
} as const;

/** Normalize raw status string → StatusKey */
export function normalizeStatus(raw: string | null | undefined): StatusKey {
  const key = (raw ?? "todo").toLowerCase().trim();
  if (key === "review") return "in_review";
  if (key === "inprogress" || key === "in progress") return "in_progress";
  if (key === "inreview" || key === "in review") return "in_review";
  if (key in STATUS_CONFIG) return key as StatusKey;
  return "todo";
}

/** All status keys in pipeline order */
export const STATUS_KEYS: StatusKey[] = ["todo", "in_progress", "in_review", "done"];
