export type AssigneeManHoursSummary = {
  userId: string | null;
  name: string;
  manHoursSeconds: number;
  isRunning: boolean;
  isSessionOpen: boolean;
  isAccumulating: boolean;
};

export type TaskManHoursSummary = {
  taskId: string;
  taskTitle: string;
  status: string;
  activeDurationSeconds: number;
  totalManHoursSeconds: number;
  isRunning: boolean;
  isSessionOpen: boolean;
  isAccumulating: boolean;
  currentWindowStart: string | null;
  currentWindowEnd: string | null;
  nextWindowStart: string | null;
  todayIsSelected: boolean;
  todayHasExtension: boolean;
  effectiveEndLocalTime: string;
  scheduleState: "configured" | "legacy";
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
  timeZone: string;
  normalWorkdayStart: string;
  normalWorkdayEnd: string;
  nextRefreshAt: string | null;
  tasks: TaskManHoursSummary[];
  projectTotals: ProjectManHoursTotals;
};

export type TaskSchedulePermission = {
  canManage: boolean;
  canCorrectHistory: boolean;
};

export type TaskWorkdayExtension = {
  id?: string;
  taskId: string;
  projectId?: string;
  workDate: string;
  extendedUntilLocalTime: string;
  reason: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt: string | null;
  cancelledBy?: string | null;
};

export type TaskWorkingSchedule = TaskSchedulePermission & {
  taskId: string;
  projectId: string;
  scheduleState: "configured" | "legacy";
  timeZone: string;
  normalWorkdayStart: string;
  normalWorkdayEnd: string;
  effectiveFrom: string | null;
  dates: string[];
  selectedDateCount: number;
  todayLocalDate: string;
  todayIsSelected: boolean;
  nextSelectedDate: string | null;
  currentExtension: TaskWorkdayExtension | null;
};

export type TaskWorkingDatesResponse = TaskWorkingSchedule;

export type ScheduleAwareManHoursSummary = TaskManHoursSummary;

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
