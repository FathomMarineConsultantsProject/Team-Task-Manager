"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { normalizeStatus } from "@/lib/statusConfig";
import type {
  AssigneeManHoursSummary,
  ProjectManHoursResponse,
  ProjectManHoursTotals,
  TaskManHoursSummary,
} from "@/lib/manHours";

export type LiveAssigneeManHoursSummary = AssigneeManHoursSummary & {
  liveManHoursSeconds: number;
};

export type LiveTaskManHoursSummary = Omit<TaskManHoursSummary, "assignees"> & {
  liveActiveDurationSeconds: number;
  liveTotalManHoursSeconds: number;
  assignees: LiveAssigneeManHoursSummary[];
};

export function isLiveManHoursTaskRunning(task: TaskManHoursSummary) {
  const status = normalizeStatus(task.status);
  return task.trackingState === "tracked"
    && task.isSessionOpen
    && task.isAccumulating
    && (status === "in_progress" || status === "draft_review" || status === "in_review");
}

export function useProjectManHours(projectId: string, refreshKey = 0) {
  const { supabase } = useAppData();
  const [data, setData] = useState<ProjectManHoursResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const retry = useCallback(() => setRetryKey((current) => current + 1), []);

  useEffect(() => {
    if (!data?.nextRefreshAt) return;
    const boundary = new Date(data.nextRefreshAt).getTime();
    if (Number.isNaN(boundary)) return;
    const delay = Math.max(0, boundary - Date.now()) + 100;
    const timeout = window.setTimeout(
      () => setRetryKey((current) => current + 1),
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [data?.nextRefreshAt]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Please sign in again to view project man-hours.");

        const response = await fetch(`/api/projects/${projectId}/man-hours`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as ProjectManHoursResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load project man-hours.");
        setData(result);
        setNow(Date.now());
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Could not load project man-hours.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [projectId, refreshKey, retryKey, supabase]);

  const taskSummaries = useMemo<LiveTaskManHoursSummary[]>(() => (data?.tasks ?? []).map((task) => {
    const running = isLiveManHoursTaskRunning(task);
    const baseline = new Date(data?.asOf ?? "").getTime();
    const windowEnd = task.currentWindowEnd ? new Date(task.currentWindowEnd).getTime() : Number.POSITIVE_INFINITY;
    const elapsedSinceAsOf = running && !Number.isNaN(baseline) && !Number.isNaN(windowEnd)
      ? Math.max(0, Math.floor((Math.min(now, windowEnd) - baseline) / 1000))
      : 0;
    const assignees = task.assignees.map((assignee) => ({
      ...assignee,
      liveManHoursSeconds: assignee.manHoursSeconds
        + (running && assignee.isAccumulating ? elapsedSinceAsOf : 0),
    }));
    return {
      ...task,
      assignees,
      liveActiveDurationSeconds: task.activeDurationSeconds + (running ? elapsedSinceAsOf : 0),
      liveTotalManHoursSeconds: task.totalManHoursSeconds
        + assignees.reduce((sum, assignee) => sum + (assignee.liveManHoursSeconds - assignee.manHoursSeconds), 0),
    };
  }), [data?.asOf, data?.tasks, now]);

  const taskSummaryById = useMemo(
    () => new Map(taskSummaries.map((task) => [task.taskId, task])),
    [taskSummaries],
  );

  const projectTotals = useMemo<ProjectManHoursTotals | null>(() => {
    if (!data) return null;
    return {
      ...data.projectTotals,
      activeDurationSeconds: taskSummaries.reduce((sum, task) => sum + (task.trackingState === "tracked" ? task.liveActiveDurationSeconds : 0), 0),
      totalManHoursSeconds: taskSummaries.reduce((sum, task) => sum + (task.trackingState === "tracked" ? task.liveTotalManHoursSeconds : 0), 0),
    };
  }, [data, taskSummaries]);

  return {
    data,
    taskSummaries,
    taskSummaryById,
    projectTotals,
    loading,
    error,
    retry,
    now,
  };
}
