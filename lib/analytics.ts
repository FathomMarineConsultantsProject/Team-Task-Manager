/**
 * Analytics computation utilities.
 * All functions are pure — they compute KPIs from arrays of tasks/logs.
 * No Supabase calls here; data is fetched by the calling page and passed in.
 */

import { normalizeStatus, STATUS_CONFIG, type StatusKey, STATUS_KEYS } from "./statusConfig";
import { DEFAULT_PROJECT_TIME_ZONE, addDaysToDateOnly, getEffectiveTaskDueAt, getProjectLocalDate, getProjectRangeUtc, getSignedDaysRemaining, getTaskDueState } from "./projectDateTime";

// ── Minimal types expected by analytics ──────────────────────

export type AnalyticsTask = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  completed_at?: string | null;
  project_id?: string;
  timeZone?: string | null;
  normalWorkdayEnd?: string | null;
};

export type AnalyticsLog = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string | null;
};

export type AnalyticsAssignee = {
  task_id: string;
  user_id: string;
};

export type AnalyticsUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

// ── KPI types ────────────────────────────────────────────────

export type ProjectKPIs = {
  total: number;
  completed: number;
  inProgress: number;
  draftReview: number;
  inReview: number;
  todo: number;
  overdue: number;
  nearDue: number;
  completedEarly: number;
  notStarted: number;
  completionRate: number;
};

export type StatusDistribution = {
  status: StatusKey;
  label: string;
  count: number;
  color: string;
};

export type WorkloadEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
};

export type VelocityPoint = {
  week: string;
  completed: number;
};

// ── Helper ───────────────────────────────────────────────────

function isOverdue(task: AnalyticsTask, now: Date): boolean {
  if (!task.end_date) return false;
  const status = normalizeStatus(task.status);
  if (status === "done") return false;
  return getTaskDueState({
    dueDate: task.end_date,
    now,
    timeZone: task.timeZone,
    workdayEnd: task.normalWorkdayEnd,
  }).state === "overdue";
}

function isNearDue(task: AnalyticsTask, now: Date, withinDays = 3): boolean {
  if (!task.end_date) return false;
  const status = normalizeStatus(task.status);
  if (status === "done") return false;
  const dueDate = getEffectiveTaskDueAt({ dueDate: task.end_date, timeZone: task.timeZone, workdayEnd: task.normalWorkdayEnd });
  if (!dueDate || dueDate <= now) return false;
  const diffMs = dueDate.getTime() - now.getTime();
  return diffMs <= withinDays * 86400000;
}

function isCompletedEarly(task: AnalyticsTask): boolean {
  if (!task.end_date || !task.completed_at) return false;
  const status = normalizeStatus(task.status);
  if (status !== "done") return false;
  const dueAt = getEffectiveTaskDueAt({ dueDate: task.end_date, timeZone: task.timeZone, workdayEnd: task.normalWorkdayEnd });
  return Boolean(dueAt && new Date(task.completed_at) < dueAt);
}

// ── Core computations ────────────────────────────────────────

export function computeKPIs(tasks: AnalyticsTask[], now = new Date()): ProjectKPIs {
  const total = tasks.length;
  let completed = 0;
  let inProgress = 0;
  let draftReview = 0;
  let inReview = 0;
  let todo = 0;
  let overdue = 0;
  let nearDue = 0;
  let completedEarly = 0;
  let notStarted = 0;

  for (const t of tasks) {
    const s = normalizeStatus(t.status);
    if (s === "done") completed++;
    else if (s === "in_progress") inProgress++;
    else if (s === "draft_review") draftReview++;
    else if (s === "in_review") inReview++;
    else todo++;

    if (isOverdue(t, now)) overdue++;
    if (isNearDue(t, now)) nearDue++;
    if (isCompletedEarly(t)) completedEarly++;
    if (s === "todo" && !t.start_date) notStarted++;
  }

  return {
    total,
    completed,
    inProgress,
    draftReview,
    inReview,
    todo,
    overdue,
    nearDue,
    completedEarly,
    notStarted,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function computeStatusDistribution(tasks: AnalyticsTask[]): StatusDistribution[] {
  const counts: Record<StatusKey, number> = { todo: 0, in_progress: 0, draft_review: 0, in_review: 0, done: 0 };
  for (const t of tasks) {
    counts[normalizeStatus(t.status)]++;
  }
  return STATUS_KEYS.map((key) => ({
    status: key,
    label: STATUS_CONFIG[key].label,
    count: counts[key],
    color: STATUS_CONFIG[key].barColor,
  }));
}

export function computeWorkload(
  tasks: AnalyticsTask[],
  assignees: AnalyticsAssignee[],
  users: AnalyticsUser[],
  now = new Date(),
): WorkloadEntry[] {
  // Build assignee → tasks mapping (primary + multi-assignee)
  const userTasks = new Map<string, AnalyticsTask[]>();

  for (const t of tasks) {
    if (t.assigned_to) {
      if (!userTasks.has(t.assigned_to)) userTasks.set(t.assigned_to, []);
      userTasks.get(t.assigned_to)!.push(t);
    }
  }
  for (const a of assignees) {
    if (!userTasks.has(a.user_id)) userTasks.set(a.user_id, []);
    const task = tasks.find((t) => t.id === a.task_id);
    if (task && !userTasks.get(a.user_id)!.some((t) => t.id === task.id)) {
      userTasks.get(a.user_id)!.push(task);
    }
  }

  const usersById = new Map(users.map((u) => [u.id, u]));

  return Array.from(userTasks.entries())
    .map(([userId, uTasks]) => {
      const user = usersById.get(userId);
      return {
        userId,
        name: user?.name ?? user?.email ?? "Unknown",
        avatarUrl: user?.avatar_url ?? null,
        total: uTasks.length,
        completed: uTasks.filter((t) => normalizeStatus(t.status) === "done").length,
        inProgress: uTasks.filter((t) => normalizeStatus(t.status) === "in_progress").length,
        overdue: uTasks.filter((t) => isOverdue(t, now)).length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeVelocity(logs: AnalyticsLog[], weekCount = 8, timeZone = DEFAULT_PROJECT_TIME_ZONE): VelocityPoint[] {
  const now = new Date();
  const points: VelocityPoint[] = [];
  const localToday = getProjectLocalDate(timeZone, now);
  const weekday = new Date(`${localToday}T00:00:00Z`).getUTCDay();
  const currentWeekStart = addDaysToDateOnly(localToday, -weekday);

  for (let i = weekCount - 1; i >= 0; i--) {
    const startDate = addDaysToDateOnly(currentWeekStart, -i * 7);
    const { start: weekStart, endExclusive: weekEnd } = getProjectRangeUtc({
      startDate,
      endDateExclusive: addDaysToDateOnly(startDate, 7),
      timeZone,
    });

    const count = logs.filter((log) => {
      if (log.action !== "moved" || log.to_status !== "done") return false;
      const logDate = new Date(log.created_at);
      return logDate >= weekStart && logDate < weekEnd;
    }).length;

    const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone }).format(weekStart);
    points.push({ week: label, completed: count });
  }

  return points;
}

export type OverdueTask = AnalyticsTask & {
  daysOverdue: number;
  assigneeName: string;
};

export function getOverdueTasks(
  tasks: AnalyticsTask[],
  users: AnalyticsUser[],
  now = new Date(),
): OverdueTask[] {
  const usersById = new Map(users.map((u) => [u.id, u]));
  return tasks
    .filter((t) => isOverdue(t, now))
    .map((t) => {
      const user = t.assigned_to ? usersById.get(t.assigned_to) : null;
      const signedDays = getSignedDaysRemaining({ dueDate: t.end_date, now, timeZone: t.timeZone, workdayEnd: t.normalWorkdayEnd });
      const daysOverdue = signedDays === null ? 0 : Math.max(1, Math.abs(signedDays));
      return {
        ...t,
        daysOverdue,
        assigneeName: user?.name ?? user?.email ?? "Unassigned",
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
