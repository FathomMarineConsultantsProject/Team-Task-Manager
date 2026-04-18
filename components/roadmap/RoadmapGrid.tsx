"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, ChevronLeft, ChevronRight, LayoutGrid, Layers, Share2 } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import Modal from "@/components/ui/modal";
import {
  formatWeekLabel,
  getAvailableWeeks,
  getTaskDate,
  getWeekDays,
  getWeekDayIndex,
  isSameWeek,
  startOfWeek,
  type RoadmapProject,
  type RoadmapTask,
  type RoadmapWeek,
} from "@/lib/roadmap";

type ProjectRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_completed: boolean | null;
  is_deleted: boolean | null;
  created_at: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  assigned_to: string | null;
  project_id: string | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: string | null;
  created_at: string | null;
  completed_at: string | null;
  assigned_user:
  | {
    id: string;
    name: string | null;
  }
  | {
    id: string;
    name: string | null;
  }[]
  | null;
};

type RoadmapProjectRecord = RoadmapProject & {
  start_date: string | null;
  end_date: string | null;
  is_completed: boolean;
  created_at: string | null;
  tasksInWeek: RoadmapTask[];
};

type SelectedTaskDetails = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  statusKey: string;
  assignee: string;
  createdAt: string;
  createdByName: string;
  projectName: string;
  creator: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
};

type TaskLogEntry = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string | null;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskDetailsRow = {
  id: string;
  title: string | null;
  created_by?: string | null;
};

type TaskLogRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string | null;
};

type TaskUpdateRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string | null;
  users:
  | {
    name: string | null;
    job_role: string | null;
  }
  | {
    name: string | null;
    job_role: string | null;
  }[]
  | null;
};

type TaskUpdateEntry = {
  id: string;
  content: string;
  created_at: string;
  user_id: string | null;
  user: {
    name: string | null;
    job_role: string | null;
  } | null;
};

const statusStyles: Record<string, { badge: string; label: string }> = {
  todo: { badge: "bg-gray-100 text-gray-600", label: "TODO" },
  in_progress: { badge: "bg-blue-100 text-blue-600", label: "IN PROGRESS" },
  in_review: {
    badge: "border border-purple-300 bg-purple-100 text-purple-700",
    label: "IN REVIEW",
  },
  done: { badge: "bg-green-100 text-green-700", label: "DONE" },
};

const STATUS_UI = {
  todo: {
    label: "TODO",
    header: "bg-slate-100 text-slate-700",
    border: "border-l-slate-400",
  },
  in_progress: {
    label: "IN PROGRESS",
    header: "bg-blue-100 text-blue-700",
    border: "border-l-blue-500",
  },
  in_review: {
    label: "IN REVIEW",
    header: "bg-purple-100 text-purple-700",
    border: "border-l-purple-500",
  },
  done: {
    label: "DONE",
    header: "bg-green-100 text-green-700",
    border: "border-l-green-500",
  },
} as const;

const navigationButtonClass =
  "inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300";

function layoutTabClass(active: boolean) {
  return active
    ? "inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition"
    : navigationButtonClass;
}

const taskCardClass =
  "rounded-[10px] border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStartOfWeek(date: Date) {
  return startOfWeek(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function subDays(date: Date, days: number) {
  return addDays(date, -days);
}

function getAdjacentWeek(weeks: RoadmapWeek[], currentWeek: RoadmapWeek, direction: -1 | 1) {
  const currentIndex = weeks.findIndex((week) => week.start.getTime() === currentWeek.start.getTime());
  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= weeks.length) {
    return null;
  }

  return weeks[nextIndex] ?? null;
}

function getProjectRange(project: RoadmapProjectRecord, fallbackWeek: RoadmapWeek) {
  const start = startOfWeek(parseDate(project.start_date) ?? fallbackWeek.start);
  const end = project.end_date ? parseDate(project.end_date) ?? fallbackWeek.end : fallbackWeek.end;
  return { start, end };
}

function isDateWithinRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

export default function RoadmapGrid() {
  const { supabase, profile, isAuthLoading } = useAppData();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<RoadmapProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [currentWeekStart, setCurrentWeekStart] = useState<Date | null>(() => getStartOfWeek(new Date()));
  const [layout, setLayout] = useState<"gantt" | "kanban" | "epic">("gantt");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<SelectedTaskDetails | null>(null);
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [taskUpdates, setTaskUpdates] = useState<TaskUpdateEntry[]>([]);
  const [isUpdateComposerOpen, setIsUpdateComposerOpen] = useState(false);
  const [updateContent, setUpdateContent] = useState("");
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const didApplyQueryParams = useRef(false);
  const taskId = selectedTaskDetails?.id ?? null;
  const showUpdateButton = false;

  useEffect(() => {
    let isMounted = true;

    const loadRoadmap = async () => {
      if (isAuthLoading) {
        return;
      }

      if (!profile?.id) {
        if (isMounted) {
          setProjects([]);
          setIsLoading(false);
          setLoadError(searchParams.get("projectId") || searchParams.get("week") ? "Please log in to view shared roadmap" : null);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setLoadError(null);
      }

      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", profile.id);

        if (membershipError) {
          throw membershipError;
        }

        const memberProjectIds = Array.from(
          new Set(
            ((membershipRows ?? []) as Array<{ project_id: string | null }>)
              .map((row) => row.project_id)
              .filter((projectId): projectId is string => Boolean(projectId)),
          ),
        );

        const fetchProjects = async (includeDeletedColumn: boolean) => {
          const isAdmin = (profile.system_role ?? profile.role ?? "").toLowerCase() === "admin";
          let projectQuery = supabase
            .from("projects")
            .select(
              includeDeletedColumn
                ? "id, name, start_date, end_date, is_completed, is_deleted, created_at, owner_id"
                : "id, name, start_date, end_date, is_completed, created_at, owner_id",
            )
            .order("is_completed", { ascending: true })
            .order("created_at", { ascending: false });

          if (!isAdmin) {
            if (memberProjectIds.length > 0) {
              const membershipFilter = `id.in.(${memberProjectIds.join(",")})`;
              projectQuery = projectQuery.or([`owner_id.eq.${profile.id}`, membershipFilter].join(","));
            } else {
              projectQuery = projectQuery.eq("owner_id", profile.id);
            }
          }

          if (includeDeletedColumn) {
            projectQuery = projectQuery.neq("is_deleted", true);
          }

          return projectQuery;
        };

        let projectResult = await fetchProjects(true);
        if (projectResult.error) {
          projectResult = await fetchProjects(false);
        }

        if (projectResult.error) {
          throw projectResult.error;
        }

        const projectRows = ((projectResult.data ?? []) as unknown as ProjectRow[]).filter((project) => project.is_deleted !== true);
        const accessibleProjectIds = projectRows.map((project) => project.id).filter((projectId): projectId is string => Boolean(projectId));

        if (accessibleProjectIds.length === 0) {
          if (isMounted) {
            setProjects([]);
            setIsLoading(false);
          }
          return;
        }

        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select(
            `
              id,
              title,
              status,
              assigned_to,
              project_id,
              updated_at,
              created_at,
              start_date,
              end_date,
              completed_at,
              assigned_user:users(id, name)
            `,
          )
          .in("project_id", accessibleProjectIds)
          .order("created_at", { ascending: false, nullsFirst: false });

        if (taskError) {
          throw taskError;
        }

        const tasksByProjectId = new Map<string, RoadmapTask[]>();

        ((taskRows ?? []) as unknown as TaskRow[]).forEach((task) => {
          if (!task.project_id) {
            return;
          }

          const normalizedAssignedUser = Array.isArray(task.assigned_user)
            ? task.assigned_user[0] ?? null
            : task.assigned_user;

          const existingTasks = tasksByProjectId.get(task.project_id) ?? [];
          existingTasks.push({
            id: task.id,
            title: task.title,
            status: task.status,
            assigned_to: task.assigned_to,
            assigned_user: normalizedAssignedUser,
            project_id: task.project_id,
            start_date: task.start_date,
            end_date: task.end_date,
            updated_at: task.updated_at,
            created_at: task.created_at,
            completed_at: task.completed_at,
          });
          tasksByProjectId.set(task.project_id, existingTasks);
        });

        const normalizedProjects = projectRows
          .map<RoadmapProjectRecord>((project) => ({
            id: project.id,
            name: project.name,
            start_date: project.start_date ?? null,
            end_date: project.end_date ?? null,
            is_completed: project.is_completed === true,
            created_at: project.created_at ?? null,
            tasks: tasksByProjectId.get(project.id) ?? [],
            tasksInWeek: [],
          }))
          .filter((project) => project.tasks.length > 0 || project.start_date || project.end_date)
          .sort((left, right) => {
            if (left.is_completed !== right.is_completed) {
              return Number(left.is_completed) - Number(right.is_completed);
            }

            const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
            const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
            return rightTime - leftTime;
          });

        if (isMounted) {
          setProjects(normalizedProjects);
        }
      } catch (error) {
        console.error("Failed to load roadmap", error);
        if (isMounted) {
          setProjects([]);
          setLoadError("Failed to load roadmap data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadRoadmap();

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, profile?.id, profile?.role, searchParams, supabase]);

  const allProjects = useMemo(() => projects, [projects]);

  const selectedProjects = useMemo(() => {
    if (selectedProjectId === "all") {
      return allProjects;
    }

    return allProjects.filter((project) => project.id === selectedProjectId);
  }, [allProjects, selectedProjectId]);

  const availableWeeks = useMemo(() => getAvailableWeeks(selectedProjects), [selectedProjects]);

  useEffect(() => {
    if (didApplyQueryParams.current || isAuthLoading || isLoading) {
      return;
    }

    const projectParam = searchParams.get("projectId");
    const weekParam = searchParams.get("week");

    if (projectParam) {
      setSelectedProjectId(projectParam);
    }

    const parsedWeek = parseDateInputValue(weekParam);
    if (parsedWeek) {
      setCurrentWeekStart(startOfWeek(parsedWeek));
    }

    didApplyQueryParams.current = true;
  }, [isAuthLoading, isLoading, searchParams]);

  useEffect(() => {
    if (availableWeeks.length === 0) {
      return;
    }

    if (!currentWeekStart) {
      setCurrentWeekStart(getStartOfWeek(new Date()));
      return;
    }

    const exactMatch = availableWeeks.find((week) => week.start.getTime() === currentWeekStart.getTime());
    if (exactMatch) {
      return;
    }

    const targetWeekStart = getStartOfWeek(currentWeekStart);
    const nearestWeek =
      [...availableWeeks].reverse().find((week) => week.start.getTime() <= targetWeekStart.getTime()) ??
      availableWeeks[availableWeeks.length - 1] ??
      null;

    if (targetWeekStart.getTime() > (availableWeeks[availableWeeks.length - 1]?.start.getTime() ?? 0)) {
      return;
    }

    setCurrentWeekStart(nearestWeek?.start ?? targetWeekStart);
  }, [availableWeeks, currentWeekStart]);

  const currentWeek = useMemo(() => {
    if (!currentWeekStart) {
      return null;
    }

    const exactWeek = availableWeeks.find((week) => week.start.getTime() === currentWeekStart.getTime());
    if (exactWeek) {
      return exactWeek;
    }

    const start = getStartOfWeek(currentWeekStart);
    const end = addDays(start, 6);

    return {
      start,
      end,
      label: formatWeekLabel(start, end),
    };
  }, [availableWeeks, currentWeekStart]);

  const currentWeekDays = useMemo(() => (currentWeek ? getWeekDays(currentWeek) : []), [currentWeek]);
  const todayStartTime = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }, []);

  const visibleProjects = useMemo<RoadmapProjectRecord[]>(() => {
    if (!currentWeek) {
      return [];
    }

    return selectedProjects
      .map((project) => {
        const hasTaskInWeek = project.tasks.some((task) => {
          const taskDate = getTaskDate(task);
          return taskDate !== null && isSameWeek(taskDate, currentWeek);
        });

        if (!hasTaskInWeek) {
          return null;
        }

        return {
          ...project,
          tasksInWeek: project.tasks,
        };
      })
      .filter((project): project is RoadmapProjectRecord => project !== null);
  }, [currentWeek, selectedProjects]);

  const kanbanGroups = useMemo(() => {
    const groups = {
      todo: [] as RoadmapTask[],
      in_progress: [] as RoadmapTask[],
      in_review: [] as RoadmapTask[],
      done: [] as RoadmapTask[],
    };

    if (!currentWeek) {
      return groups;
    }

    visibleProjects.forEach((project) => {
      project.tasksInWeek.forEach((task) => {
        const taskDate = getTaskDate(task);
        if (!taskDate || !isSameWeek(taskDate, currentWeek)) {
          return;
        }

        if (!task.status) {
          return;
        }

        let status = task.status.toLowerCase();
        if (status === "review") {
          status = "in_review";
        }

        if (status in groups) {
          groups[status as keyof typeof groups].push(task);
        }
      });
    });

    return groups;
  }, [visibleProjects, currentWeek]);

  const epicGroups = useMemo(() => {
    if (!currentWeek) {
      return [];
    }

    return visibleProjects.map((project) => ({
      epicName: project.name,
      tasks: project.tasksInWeek.filter((task) => {
        const taskDate = getTaskDate(task);
        return taskDate !== null && isSameWeek(taskDate, currentWeek);
      }),
    }));
  }, [visibleProjects, currentWeek]);

  const epicGroupsWithProgress = useMemo(
    () =>
      epicGroups.map((epic) => {
        const total = epic.tasks.length;
        const completed = epic.tasks.filter((t) => t.status?.toLowerCase() === "done").length;
        const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

        return {
          ...epic,
          total,
          completed,
          progress,
        };
      }),
    [epicGroups],
  );

  const selectedProjectLabel =
    selectedProjectId === "all"
      ? "All Projects"
      : allProjects.find((project) => project.id === selectedProjectId)?.name ?? "All Projects";

  const handleWeekShift = (direction: -1 | 1) => {
    if (!currentWeek) {
      return;
    }

    const fallbackTarget = direction === 1 ? addDays(currentWeek.start, 7) : subDays(currentWeek.start, 7);

    const desiredStart = getStartOfWeek(fallbackTarget);
    const adjacentWeek = getAdjacentWeek(availableWeeks, currentWeek, direction);

    if (adjacentWeek) {
      setCurrentWeekStart(adjacentWeek.start);
      return;
    }

    setCurrentWeekStart(desiredStart);
  };

  const formatCreatedDate = (value: string | null) => {
    if (!value) {
      return "N/A";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "N/A";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const openRoadmapTaskDetails = (task: RoadmapTask, project: RoadmapProjectRecord) => {
    let statusKey = (task.status ?? "todo").toLowerCase();

    if (statusKey === "review") {
      statusKey = "in_review";
    }

    const styles = statusStyles[statusKey] ?? statusStyles.todo;
    const assigneeName = task.assigned_user?.name ?? "Unassigned";

    setSelectedTaskDetails({
      id: task.id,
      projectId: project.id,
      title: task.title ?? "Untitled task",
      status: styles.label,
      statusKey,
      assignee: assigneeName,
      createdAt: formatCreatedDate(task.created_at),
      createdByName: "Unknown",
      projectName: project.name ?? "Untitled project",
      creator: null,
    });
  };

  const handleShare = async () => {
    if (!currentWeek) {
      return;
    }

    const params = new URLSearchParams();

    if (selectedProjectId !== "all") {
      params.set("projectId", selectedProjectId);
    }

    params.set("week", toDateInputValue(currentWeek.start));

    const link = `${window.location.origin}/roadmap?${params.toString()}`;
    await navigator.clipboard.writeText(link);
    setToastMessage("Link copied to clipboard");
  };

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const loadTaskLogs = useCallback(async () => {
    try {
      setLogsLoading(true);

      if (!taskId) {
        setLogs([]);
        return;
      }

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (taskError) {
        console.error("Task details error:", taskError);
      }

      const taskDetails = (taskData as TaskDetailsRow | null) ?? null;
      let createdByName = "Unknown";

      if (taskDetails?.created_by) {
        const { data: creator } = await supabase
          .from("users")
          .select("name")
          .eq("id", taskDetails.created_by)
          .single();

        if (creator) {
          createdByName = ((creator as { name: string | null }).name ?? "Unknown") || "Unknown";
        }
      }

      setSelectedTaskDetails((prev) => {
        if (!prev || prev.id !== taskId) {
          return prev;
        }

        return {
          ...prev,
          createdByName,
          creator: {
            id: null,
            name: createdByName,
            email: null,
          },
        };
      });

      const { data: logsData, error: logsError } = await supabase
        .from("task_logs")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (logsError) {
        console.error("Task logs error:", logsError);
        setLogs([]);
        return;
      }

      if (!logsData || logsData.length === 0) {
        setLogs([]);
        return;
      }

      const userIds = [...new Set((logsData as TaskLogRow[]).map((log) => log.user_id).filter(Boolean))];

      let usersMap: Record<string, UserRow> = {};

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", userIds as string[]);

        const safeUsers = (users as UserRow[] | null) || [];
        usersMap = Object.fromEntries(safeUsers.map((u) => [u.id, u]));
      }

      const enrichedLogs = (logsData as TaskLogRow[]).map((log) => ({
        ...log,
        user: (log.user_id && usersMap[log.user_id]) || null,
      }));

      setLogs(enrichedLogs);
    } catch (err) {
      console.error("Unexpected logs error:", err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskLogs();
    }
  }, [taskId, loadTaskLogs]);

  const loadTaskUpdates = useCallback(async () => {
    try {
      if (!taskId) {
        setTaskUpdates([]);
        return;
      }

      const { data: updatesData, error: updatesError } = await supabase
        .from("task_updates")
        .select(
          `
            id,
            content,
            created_at,
            user_id,
            users (
              name,
              job_role
            )
          `,
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (updatesError) {
        setTaskUpdates([]);
        return;
      }

      const normalized = ((updatesData as TaskUpdateRow[] | null | undefined) ?? []).map((update) => {
        const userRelation = Array.isArray(update.users) ? update.users[0] ?? null : update.users ?? null;
        return {
          id: update.id,
          content: update.content ?? "",
          created_at: update.created_at,
          user_id: update.user_id,
          user: userRelation,
        };
      });

      setTaskUpdates(normalized);
    } catch {
      setTaskUpdates([]);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskUpdates();
      return;
    }

    setTaskUpdates([]);
    setIsUpdateComposerOpen(false);
    setUpdateContent("");
  }, [taskId, loadTaskUpdates]);

  const handleAddUpdate = useCallback(async () => {
    const trimmedContent = updateContent.trim();
    if (!trimmedContent || !selectedTaskDetails || !profile?.id) {
      return;
    }

    setIsSubmittingUpdate(true);

    try {
      const { error } = await supabase.from("task_updates").insert({
        task_id: selectedTaskDetails.id,
        project_id: selectedTaskDetails.projectId,
        user_id: profile.id,
        content: trimmedContent,
      });

      if (error) {
        return;
      }

      setUpdateContent("");
      setIsUpdateComposerOpen(false);
      await loadTaskUpdates();
    } catch {
      // fail silently
    } finally {
      setIsSubmittingUpdate(false);
    }
  }, [loadTaskUpdates, profile?.id, selectedTaskDetails, supabase, updateContent]);

  const formatStatusValue = (value: string | null | undefined) => {
    if (!value) {
      return "UNKNOWN";
    }

    return value.replace(/_/g, " ").toUpperCase();
  };

  const formatLogDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const describeLog = (log: TaskLogEntry) => {
    if (log.action === "moved") {
      return `Moved from ${formatStatusValue(log.from_status)} → ${formatStatusValue(log.to_status)}`;
    }

    if (log.action === "assigned") {
      return "Assigned task";
    }

    if (log.action === "created") {
      return "Task created";
    }

    return "Task updated";
  };

  if (isLoading || isAuthLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="h-6 w-64 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-6 grid grid-cols-7 gap-3">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-50" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Roadmap unavailable</p>
        <p className="mt-2 text-sm text-slate-500">{loadError}</p>
      </div>
    );
  }

  if (availableWeeks.length === 0 || !currentWeek) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Roadmap</h1>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-600">
            <span>Project</span>
            <select
              className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="all">All Projects</option>
              {allProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name ?? "Untitled project"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">No roadmap data yet</p>
          <p className="mt-2 text-sm text-slate-500">Add dated tasks to populate the roadmap timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Roadmap</h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex items-center gap-3 text-sm font-medium text-slate-600">
            <span>Project</span>
            <select
              className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="all">All Projects</option>
              {allProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name ?? "Untitled project"}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <button
              type="button"
              className={navigationButtonClass}
              onClick={() => handleWeekShift(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Week
            </button>
            <div className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              {formatWeekLabel(currentWeek.start, currentWeek.end)}
            </div>
            <button
              type="button"
              className={navigationButtonClass}
              onClick={() => handleWeekShift(1)}
            >
              Next Week
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => void handleShare()}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {toastMessage}
        </div>
      )}

      {!profile?.id && searchParams.get("projectId") && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Please log in to view shared roadmap
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Current week</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatWeekLabel(currentWeek.start, currentWeek.end)}</p>
          </div>
          <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            {selectedProjectLabel}
          </div>
        </div>

        <div className="mb-4 mt-4 flex flex-wrap gap-2">
          <button type="button" className={layoutTabClass(layout === "gantt")} onClick={() => setLayout("gantt")}>
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Gantt Chart</span>
          </button>
          <button type="button" className={layoutTabClass(layout === "kanban")} onClick={() => setLayout("kanban")}>
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span>Kanban Swimlanes</span>
          </button>
          <button type="button" className={layoutTabClass(layout === "epic")} onClick={() => setLayout("epic")}>
            <Layers className="h-4 w-4 shrink-0" />
            <span>By Epic</span>
          </button>
        </div>

        {layout === "gantt" && (
        <div className="mt-5 grid min-w-[1180px] grid-cols-[190px_repeat(7,minmax(145px,1fr))] gap-2 text-xs text-slate-500">
          <div className="font-semibold text-slate-900">Project / Task</div>
          {currentWeekDays.map((day) => (
            (() => {
              const dayStart = new Date(day.date);
              dayStart.setHours(0, 0, 0, 0);
              const dayStartTime = dayStart.getTime();
              const isToday = dayStartTime === todayStartTime;

              return (
            <div
              key={day.key}
              className={[
                "rounded-lg px-2 py-2 text-center",
                isToday ? "bg-blue-50" : "",
              ].join(" ")}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">{day.label}</div>
              <div
                className={[
                  "mt-1 text-sm font-semibold",
                  isToday ? "text-blue-700" : "text-slate-900",
                ].join(" ")}
              >
                {day.dayNumber}
              </div>
            </div>
              );
            })()
          ))}

          {visibleProjects.length === 0 ? (
            <>
              <div className="pt-2 text-sm font-semibold text-slate-900">No project activity</div>
              <div className="col-span-7 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No activity for this week
              </div>
            </>
          ) : null}

          {visibleProjects.map((project) => {
            const projectRange = getProjectRange(project, currentWeek);

            return (
              <Fragment key={project.id}>
                <div className="pt-2 text-sm font-semibold text-slate-900">{project.name ?? "Untitled project"}</div>
                {currentWeekDays.map((day, index) => {
                  const dayTasks = project.tasksInWeek.filter((task) => {
                    const taskDate = getTaskDate(task);
                    if (!taskDate || !isSameWeek(taskDate, currentWeek)) {
                      return false;
                    }

                    return getWeekDayIndex(taskDate) === index;
                  });
                  const isInsideProjectRange = isDateWithinRange(day.date, projectRange.start, projectRange.end);

                  return (
                    <div
                      key={project.id + "-" + day.key}
                      className={[
                        "rounded-xl border border-dashed bg-transparent p-2",
                        isInsideProjectRange ? "border-slate-200" : "border-slate-100 opacity-60",
                      ].join(" ")}
                    >
                      <div className="space-y-2">
                        {dayTasks.map((task) => {
                          let statusKey = (task.status ?? "todo").toLowerCase();

                          if (statusKey === "review") {
                            statusKey = "in_review";
                          }

                          const styles = statusStyles[statusKey] ?? statusStyles.todo;
                          const assigneeName = task.assigned_user?.name ?? "Unassigned";

                          return (
                            <button
                              key={task.id}
                              type="button"
                              className={[taskCardClass, "min-w-[140px] w-full text-left cursor-pointer"].join(" ")}
                              onClick={() => openRoadmapTaskDetails(task, project)}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-medium leading-tight text-slate-900">
                                    {task.title ?? "Untitled task"}
                                  </p>
                                  <p className="mt-1 text-[11px] font-normal leading-[1.3] text-slate-600">{assigneeName}</p>
                                </div>
                                <span className={"inline-flex max-w-fit whitespace-nowrap items-center rounded-full px-2 py-[2px] text-[10px] font-semibold leading-none uppercase tracking-[0.08em] " + styles.badge}>
                                  {styles.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        )}

        {layout === "kanban" && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(kanbanGroups).map(([status, tasks]) => {
              const ui = STATUS_UI[status as keyof typeof STATUS_UI];

              return (
                <div key={status}>
                  <div className={`mb-3 rounded-md px-3 py-2 text-xs font-semibold ${ui?.header ?? ""}`}>
                    {ui?.label ?? status.toUpperCase()}
                  </div>

                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => {
                        const project = visibleProjects.find(
                          (p) => p.id === task.project_id || p.tasksInWeek.some((t) => t.id === task.id),
                        );
                        if (project) {
                          openRoadmapTaskDetails(task, project);
                        }
                      }}
                      className={`mb-3 cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md border-l-4 ${ui?.border ?? "border-l-slate-400"}`}
                    >
                      <p className="text-sm font-medium text-slate-900">{task.title ?? "Untitled task"}</p>

                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>{task.assigned_user?.name || "Unassigned"}</span>
                        <span className="text-[10px] opacity-70">{task.start_date ?? ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {layout === "epic" && (
          <div className="mt-5 space-y-4">
            {epicGroupsWithProgress.map((epic, epicIndex) => {
              const epicProject = visibleProjects[epicIndex];

              return (
                <div key={`${epic.epicName ?? "epic"}-${epicIndex}`} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 font-semibold text-slate-900">{epic.epicName ?? "Untitled project"}</h3>

                  <div className="mb-3">
                    <div className="mb-1 flex justify-between text-xs text-gray-500">
                      <span>
                        {epic.completed}/{epic.total} done
                      </span>
                      <span>{epic.progress}%</span>
                    </div>

                    <div className="h-2 w-full rounded bg-slate-200">
                      <div className="h-2 rounded bg-blue-500" style={{ width: `${epic.progress}%` }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {epic.tasks.map((task) => {
                      const raw = task.status?.toLowerCase();
                      const statusChipKey = raw === "review" ? "in_review" : raw;

                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            if (epicProject) {
                              openRoadmapTaskDetails(task, epicProject);
                            }
                          }}
                          className={`cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 border-l-4 ${
                            STATUS_UI[statusChipKey as keyof typeof STATUS_UI]?.border ?? "border-l-slate-400"
                          }`}
                        >
                          {task.title ?? "Untitled task"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        title="Task Details"
        isOpen={Boolean(selectedTaskDetails)}
        onClose={() => {
          setSelectedTaskDetails(null);
          setIsUpdateComposerOpen(false);
          setUpdateContent("");
        }}
      >
        {selectedTaskDetails && (
          <div className="space-y-5 text-sm text-slate-700">
            <div>
              <p className="text-xl font-bold leading-tight text-slate-900">{selectedTaskDetails.title}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={"inline-flex max-w-fit whitespace-nowrap items-center rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em] " + (statusStyles[selectedTaskDetails.statusKey]?.badge ?? statusStyles.todo.badge)}>
                {selectedTaskDetails.status}
              </span>
              <span className="text-sm text-slate-600">{selectedTaskDetails.assignee}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Created date</p>
                <p className="mt-1 text-slate-900">{selectedTaskDetails.createdAt}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Created by</p>
                <p className="mt-1 text-slate-900">
                  {selectedTaskDetails.createdByName || "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Project name</p>
                <p className="mt-1 text-slate-900">{selectedTaskDetails.projectName}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Activity Timeline</p>
              <div className="mt-3 space-y-0 max-h-[220px] overflow-y-auto pr-1">
                {logsLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Loading activity...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No activity yet
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={log.id} className="relative pl-7 pb-4">
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                      {index < logs.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-slate-200" />}
                      <p className="mt-1 text-sm text-slate-800">{describeLog(log)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{log.user?.name || log.user?.email || "Unknown"} • {formatLogDate(log.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Updates</p>

              {showUpdateButton !== false && !isUpdateComposerOpen ? (
                <button
                  type="button"
                  onClick={() => setIsUpdateComposerOpen(true)}
                  className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  + Add Update
                </button>
              ) : null}

              {showUpdateButton !== false && isUpdateComposerOpen ? (
                <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label htmlFor="task-update-content" className="sr-only">
                    Task update content
                  </label>
                  <textarea
                    id="task-update-content"
                    value={updateContent}
                    onChange={(event) => setUpdateContent(event.target.value)}
                    placeholder="What did you work on today?"
                    className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                    disabled={isSubmittingUpdate}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUpdateComposerOpen(false);
                        setUpdateContent("");
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      disabled={isSubmittingUpdate}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddUpdate()}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      disabled={isSubmittingUpdate || !updateContent.trim()}
                    >
                      {isSubmittingUpdate ? "Saving..." : "Submit"}
                    </button>
                  </div>
                </div>
              ) : null}

              {taskUpdates.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {taskUpdates.map((update) => {
                    const formattedDate = new Date(update.created_at).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div key={update.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                        <p className="whitespace-pre-wrap text-sm text-slate-900">{update.content}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {update.user?.name || "Unknown"}
                          {" • "}
                          {formattedDate}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}