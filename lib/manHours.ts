export type AssigneeManHoursSummary = {
  userId: string | null;
  name: string;
  manHoursSeconds: number;
  isRunning: boolean;
};

export type TaskManHoursSummary = {
  taskId: string;
  taskTitle: string;
  status: string;
  activeDurationSeconds: number;
  totalManHoursSeconds: number;
  isRunning: boolean;
  lastActivityAt: string | null;
  trackingState: "tracked" | "untracked";
  assignees: AssigneeManHoursSummary[];
};

export type ProjectManHoursTotals = {
  activeDurationSeconds: number;
  totalManHoursSeconds: number;
  runningTaskCount: number;
  completedTrackedTaskCount: number;
  averageCompletedTaskManHoursSeconds: number;
};

export type ProjectManHoursResponse = {
  asOf: string;
  tasks: TaskManHoursSummary[];
  projectTotals: ProjectManHoursTotals;
};

export type ReportEffortTaskSummary = Omit<TaskManHoursSummary, "taskTitle"> & {
  title: string;
};

export type ReportTeamEffortSummary = {
  userId: string | null;
  name: string;
  manHoursSeconds: number;
  activeTaskCount: number;
  completedTaskCount: number;
  sharePercent: number;
};

export type ReportEffortData = {
  asOf: string;
  rangeLabel: string;
  rangeStart: string | null;
  rangeEndExclusive: string | null;
  activeWorkDurationSeconds: number;
  totalManHoursSeconds: number;
  runningTaskCount: number;
  completedTrackedTaskCount: number;
  averageCompletedTaskManHoursSeconds: number;
  highestEffortTasks: ReportEffortTaskSummary[];
  team: ReportTeamEffortSummary[];
  tasks: ReportEffortTaskSummary[];
};

export function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
