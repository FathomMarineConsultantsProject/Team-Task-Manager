"use client";

import { formatDuration, type ProjectManHoursTotals } from "@/lib/manHours";
import { normalizeStatus, STATUS_CONFIG } from "@/lib/statusConfig";
import { isLiveManHoursTaskRunning, type LiveTaskManHoursSummary } from "@/lib/useProjectManHours";

type ProjectManHoursProps = {
  asOf?: string | null;
  taskSummaries: LiveTaskManHoursSummary[];
  projectTotals: ProjectManHoursTotals | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

function taskState(task: LiveTaskManHoursSummary) {
  if (task.trackingState === "untracked") return "Not tracked";
  if (isLiveManHoursTaskRunning(task)) return "Running";
  if (normalizeStatus(task.status) === "done") return "Completed";
  return "Paused";
}

function taskSortGroup(task: LiveTaskManHoursSummary) {
  if (isLiveManHoursTaskRunning(task)) return 0;
  if (task.trackingState === "tracked" && normalizeStatus(task.status) === "done") return 1;
  if (task.trackingState === "tracked") return 2;
  return 3;
}

function recentActivityValue(value: string | null) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function ProjectManHours({ asOf, taskSummaries, projectTotals, loading, error, retry }: ProjectManHoursProps) {
  const sortedTasks = [...taskSummaries].sort((left, right) => {
    const groupDifference = taskSortGroup(left) - taskSortGroup(right);
    if (groupDifference !== 0) return groupDifference;
    if (taskSortGroup(left) === 3) return left.taskTitle.localeCompare(right.taskTitle);
    return recentActivityValue(right.lastActivityAt) - recentActivityValue(left.lastActivityAt);
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="project-man-hours-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="project-man-hours-heading" className="text-lg font-semibold text-slate-950">Man-Hours</h2>
          <p className="mt-1 text-sm text-slate-500">Track active and completed effort by task and assignee.</p>
        </div>
        {asOf ? <p className="text-xs text-slate-400">Updated {new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p> : null}
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500" role="status">Loading man-hour data...</div>
      ) : error ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-slate-600">{error}</p>
          <button type="button" onClick={retry} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:self-auto">Retry</button>
        </div>
      ) : projectTotals ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: "Total Tracked Effort", value: formatDuration(projectTotals.totalManHoursSeconds) },
              { label: "Running Tasks", value: String(projectTotals.runningTaskCount) },
              { label: "Completed Tracked", value: String(projectTotals.completedTrackedTaskCount) },
              { label: "Average Completed", value: formatDuration(projectTotals.averageCompletedTaskManHoursSeconds) },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">{metric.label}</p>
                <p className="mt-0.5 text-base font-semibold text-slate-950">{metric.value}</p>
              </div>
            ))}
          </div>

          {sortedTasks.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No man-hour data available yet.</div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="sticky top-0 z-10 hidden grid-cols-[minmax(180px,2fr)_120px_130px_140px_minmax(220px,2fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
                <span>Task</span><span>Status</span><span>Active Duration</span><span>Total Man-Hours</span><span>Assignee Effort</span>
              </div>
              <div className="divide-y divide-slate-100 md:max-h-[560px] md:overflow-y-auto">
                {sortedTasks.map((task) => {
                  const tracked = task.trackingState === "tracked";
                  const status = normalizeStatus(task.status);
                  const state = taskState(task);
                  return (
                    <article key={task.taskId} className="px-4 py-3 md:grid md:grid-cols-[minmax(180px,2fr)_120px_130px_140px_minmax(220px,2fr)] md:items-start md:gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-950">{task.taskTitle}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400 md:hidden">{STATUS_CONFIG[status].label} - {state}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 md:mt-0">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CONFIG[status].badge}`}>{STATUS_CONFIG[status].label}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{state}</span>
                      </div>
                      <div className="mt-2 md:mt-0"><p className="text-[10px] font-medium uppercase text-slate-400 md:hidden">Active Duration</p><p className="text-sm font-medium text-slate-800">{tracked ? formatDuration(task.liveActiveDurationSeconds) : "Not tracked"}</p></div>
                      <div className="mt-2 md:mt-0"><p className="text-[10px] font-medium uppercase text-slate-400 md:hidden">Total Man-Hours</p><p className="text-sm font-semibold text-slate-900">{tracked ? formatDuration(task.liveTotalManHoursSeconds) : "Not tracked"}</p></div>
                      <div className="mt-2 min-w-0 text-sm text-slate-600 md:mt-0">
                        <p className="text-[10px] font-medium uppercase text-slate-400 md:hidden">Assignee Effort</p>
                        {tracked && task.assignees.length > 0
                          ? task.assignees.map((assignee) => `${assignee.name} ${formatDuration(assignee.liveManHoursSeconds)}`).join(" - ")
                          : tracked ? "No tracked assignee effort" : "Not tracked"}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
