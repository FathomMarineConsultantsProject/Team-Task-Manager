"use client";

import ModalPortal from "@/components/ModalPortal";
import { formatDuration } from "@/lib/manHours";
import { normalizeStatus, STATUS_CONFIG } from "@/lib/statusConfig";
import { isLiveManHoursTaskRunning, type LiveTaskManHoursSummary } from "@/lib/useProjectManHours";

type TaskManHoursPanelProps = {
  summary: LiveTaskManHoursSummary;
  variant?: "floating" | "inline";
};

function trackingLabel(summary: LiveTaskManHoursSummary) {
  if (summary.trackingState === "untracked") return "Not tracked";
  if (normalizeStatus(summary.status) === "done") return "Completed";
  if (isLiveManHoursTaskRunning(summary)) return "Running";
  return "Paused";
}

function PanelContent({ summary }: { summary: LiveTaskManHoursSummary }) {
  const status = normalizeStatus(summary.status);
  const state = trackingLabel(summary);
  const tracked = summary.trackingState === "tracked";
  const activeLabel = state === "Completed" ? "Final active duration" : state === "Paused" ? "Tracked active duration" : "Active duration";

  return (
    <div className="p-4">
      <div className="border-b border-slate-100 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live Man-Hours</p>
        <p className="mt-2 break-words text-sm font-semibold leading-snug text-slate-950">{summary.taskTitle}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CONFIG[status].badge}`}>{STATUS_CONFIG[status].label}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{state}</span>
        </div>
      </div>

      {!tracked ? (
        <div className="py-4 text-sm font-medium text-slate-500">Not tracked</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div>
              <p className="text-[11px] font-medium text-slate-500">{activeLabel}</p>
              <p className="mt-1 text-base font-semibold text-slate-950">{formatDuration(summary.liveActiveDurationSeconds)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total man-hours</p>
              <p className="mt-1 text-base font-semibold text-slate-950">{formatDuration(summary.liveTotalManHoursSeconds)}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Assignee effort</p>
            {summary.assignees.length > 0 ? (
              <div className="mt-2 space-y-2">
                {summary.assignees.map((assignee, index) => (
                  <div key={`${assignee.userId ?? assignee.name}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words text-slate-700">{assignee.name}</span>
                    <span className="shrink-0 font-semibold text-slate-900">{formatDuration(assignee.liveManHoursSeconds)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-slate-400">No tracked assignee effort.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default function TaskManHoursPanel({ summary, variant = "floating" }: TaskManHoursPanelProps) {
  if (variant === "inline") {
    return <section className="min-[1700px]:hidden overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60"><PanelContent summary={summary} /></section>;
  }

  return (
    <ModalPortal>
      <aside
        className="fixed z-[10000] hidden w-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl min-[1700px]:block"
        style={{ top: "5vh", right: "calc(50% + 272px)", maxHeight: "90vh" }}
        aria-label="Live Man-Hours"
      >
        <PanelContent summary={summary} />
      </aside>
    </ModalPortal>
  );
}
