"use client";

import { formatDuration } from "@/lib/manHours";
import { normalizeStatus, STATUS_CONFIG } from "@/lib/statusConfig";
import { isLiveManHoursTaskRunning, type LiveTaskManHoursSummary } from "@/lib/useProjectManHours";

type TaskManHoursPanelProps = {
  summary: LiveTaskManHoursSummary;
  variant?: "inline" | "embedded";
};

function trackingLabel(summary: LiveTaskManHoursSummary) {
  if (summary.trackingState === "untracked") return "Not tracked";
  if (normalizeStatus(summary.status) === "done") return "Completed";
  if (summary.scheduleState === "legacy") return "Schedule not configured";
  if (!summary.todayIsSelected) return "Off day";
  if (isLiveManHoursTaskRunning(summary)) return "Running";
  if (summary.isSessionOpen && !summary.isAccumulating) return "Outside working hours";
  return "Paused";
}

function PanelContent({ summary }: { summary: LiveTaskManHoursSummary }) {
  const status = normalizeStatus(summary.status);
  const state = trackingLabel(summary);
  const tracked = summary.trackingState === "tracked";
  const activeLabel = state === "Completed" ? "Final active duration" : state === "Running" ? "Active duration" : "Tracked active duration";

  return (
    <div className="p-3.5">
      <div className="border-b border-slate-100 pb-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live Man-Hours</p>
        <p className="mt-1.5 break-words text-sm font-semibold leading-snug text-slate-950">{summary.taskTitle}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CONFIG[status].badge}`}>{STATUS_CONFIG[status].label}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{state}</span>
        </div>
        {!summary.isAccumulating && summary.nextWindowStart ? <p className="mt-1 text-[11px] text-slate-500">Resumes in the next selected working window.</p> : null}
      </div>

      {!tracked ? (
        <div className="py-4 text-sm font-medium text-slate-500">Not tracked</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 pt-3">
            <div>
              <p className="text-[11px] font-medium text-slate-500">{activeLabel}</p>
              <p className="mt-1 text-base font-semibold text-slate-950">{formatDuration(summary.liveActiveDurationSeconds)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total man-hours</p>
              <p className="mt-1 text-base font-semibold text-slate-950">{formatDuration(summary.liveTotalManHoursSeconds)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TaskManHoursPanel({ summary, variant = "embedded" }: TaskManHoursPanelProps) {
  if (variant === "inline") {
    return <section className="min-[1700px]:hidden overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60"><PanelContent summary={summary} /></section>;
  }

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" aria-label="Live Man-Hours"><PanelContent summary={summary} /></section>;
}
