"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Modal from "@/components/ui/modal";
import ChatPanel from "@/components/ui/ChatPanel";
import TaskAttachments from "@/components/tasks/TaskAttachments";
import TaskDependencies from "@/components/tasks/TaskDependencies";
import TaskLinks from "@/components/tasks/TaskLinks";
import TaskReviewApprovals from "@/components/tasks/TaskReviewApprovals";
import LinkifiedText from "@/components/ui/LinkifiedText";
import ModalPortal from "@/components/ModalPortal";
import TaskManHoursPanel from "@/components/tasks/TaskManHoursPanel";
import TaskWorkingDaysPanel from "@/components/tasks/TaskWorkingDaysPanel";
import TaskWorkingScheduleSection from "@/components/tasks/TaskWorkingScheduleSection";
import type { TaskWorkingSchedule } from "@/lib/manHours";
import useTaskWorkingSchedule from "@/lib/useTaskWorkingSchedule";
import type { LiveTaskManHoursSummary } from "@/lib/useProjectManHours";
import { DEFAULT_PROJECT_TIME_ZONE, DEFAULT_PROJECT_WORKDAY_END, formatProjectDate, isDateOnly } from "@/lib/projectDateTime";

export type TaskDetailsSeed = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  assignee?: string;
  assignees?: { id: string; name: string | null; email?: string | null }[];
  createdAt?: string | null;
  createdByName?: string | null;
  projectName: string;
  projectOwnerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  creator?: { id: string | null; name: string | null; email: string | null } | null;
  description?: string | null;
  projectTimeZone?: string | null;
  normalWorkdayEnd?: string | null;
};

type TaskDetailsState = Required<Omit<TaskDetailsSeed, "assignees" | "assignee" | "createdAt" | "createdByName" | "startDate" | "endDate" | "creator" | "description">> & {
  assignee: string;
  assignees: { id: string; name: string | null; email?: string | null }[];
  createdAt: string | null;
  createdByName: string | null;
  projectOwnerId: string | null;
  startDate: string | null;
  endDate: string | null;
  creator: { id: string | null; name: string | null; email: string | null } | null;
  description: string | null;
  /** The user ID who created this task (loaded from DB) */
  createdById: string | null;
  projectTimeZone: string;
  normalWorkdayEnd: string;
};

type TaskDetailsRow = {
  created_by: string | null;
  description: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  project_id: string | null;
  projects?: { owner_id: string | null; time_zone: string | null; normal_workday_end: string | null } | { owner_id: string | null; time_zone: string | null; normal_workday_end: string | null }[] | null;
};

type TaskLogRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string;
};

type TaskLogEntry = TaskLogRow & {
  user: { id: string | null; name: string | null; email: string | null } | null;
};

type TaskUpdateRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  reply_to: string | null;
  users:
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        job_role: string | null;
      }
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        job_role: string | null;
      }[]
    | null;
};

type TaskUpdateEntry = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  task_id: string;
  project_id: string;
  reply_to: string | null;
  user: { id: string; name: string | null; email: string | null; avatar_url: string | null } | null;
};

type TaskDetailMember = {
  user_id: string;
  role?: string | null;
  project_id?: string | null;
  user: { id: string; name: string | null; email: string | null; avatar_url?: string | null } | null;
};

type ProjectMemberRow = {
  project_id?: string | null;
  user_id: string | null;
  role?: string | null;
  user:
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url?: string | null;
      }
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url?: string | null;
      }[]
    | null;
};

type SupabaseClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
  auth?: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
};

type WorkflowOptions = {
  supabase: SupabaseClient;
  profileId: string | null;
  members: TaskDetailMember[];
  /** The owner_id of the project (used for attachment permissions) */
  projectOwnerId?: string | null;
  /** Whether the current user is an admin/super_admin */
  isAdmin?: boolean;
  canAddUpdate?: boolean;
  canViewUpdates?: boolean;
  onTaskUpdated?: () => void | Promise<void>;
  onScheduleChanged?: (taskId: string, schedule: TaskWorkingSchedule) => void;
  onExtensionChanged?: (taskId: string) => void | Promise<void>;
  onEditWorkingDates?: (taskId: string) => void;
  showWorkingDaysPanel?: boolean;
  manHoursByTaskId?: Map<string, LiveTaskManHoursSummary>;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatOptionalDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  if (isDateOnly(value)) return formatProjectDate(value, "UTC");

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatLocalTimeLabel = (value: string) => {
  const [hourValue, minute = "00"] = value.split(":");
  const hour = Number(hourValue);
  return Number.isFinite(hour) ? `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}` : value;
};

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
    return `Moved from ${formatStatusValue(log.from_status)} -> ${formatStatusValue(log.to_status)}`;
  }

  if (log.action === "assigned") {
    return "Assigned task";
  }

  if (log.action === "created") {
    return "Task created";
  }

  if (log.action === "review_completed") {
    return "Marked review as completed";
  }

  return "Task updated";
};

export function useTaskDetailsWorkflow({
  supabase,
  profileId,
  members,
  projectOwnerId,
  isAdmin,
  canAddUpdate = true,
  canViewUpdates = true,
  onTaskUpdated,
  onScheduleChanged,
  onExtensionChanged,
  onEditWorkingDates,
  showWorkingDaysPanel = false,
  manHoursByTaskId,
}: WorkflowOptions) {
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<TaskDetailsState | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [taskUpdates, setTaskUpdates] = useState<TaskUpdateEntry[]>([]);
  const [projectMembers, setProjectMembers] = useState<TaskDetailMember[]>([]);
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const [isDependenciesOpen, setIsDependenciesOpen] = useState(false);
  const [isReviewApprovalsOpen, setIsReviewApprovalsOpen] = useState(false);
  const [isLinksOpen, setIsLinksOpen] = useState(false);
  const [dependencyPendingCount, setDependencyPendingCount] = useState<number | null>(null);
  const [reviewApprovalCounts, setReviewApprovalCounts] = useState<{ reviewedCount: number; totalCount: number } | null>(null);
  const [linksCount, setLinksCount] = useState<number | null>(null);
  const taskId = selectedTaskDetails?.id ?? null;
  const projectId = selectedTaskDetails?.projectId ?? null;
  const selectedTaskManHours = taskId ? manHoursByTaskId?.get(taskId) : undefined;
  const getAccessToken = useCallback(async () => {
    if (!supabase.auth) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);
  const taskSchedules = useTaskWorkingSchedule(getAccessToken);
  const selectedSchedule = taskId ? taskSchedules.getSchedule(taskId) : null;
  const scheduleLoading = taskId ? taskSchedules.getLoading(taskId) : false;
  const scheduleError = taskId ? taskSchedules.getError(taskId) : null;

  useEffect(() => {
    if (taskId) void taskSchedules.load(taskId);
  }, [taskId, taskSchedules.load]);

  useEffect(() => {
    if (!selectedSchedule) return;
    const dates = [...selectedSchedule.dates].sort();
    setSelectedTaskDetails((current) => current?.id === selectedSchedule.taskId
      ? { ...current, startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null }
      : current);
  }, [selectedSchedule]);
  const chatMembers = useMemo(() => {
    const merged = new Map<string, TaskDetailMember>();
    [...projectMembers, ...members].forEach((member) => {
      if (member.user_id) {
        merged.set(member.user_id, member);
      }
    });
    return [...merged.values()];
  }, [members, projectMembers]);

  // ---- Attachment permission computation ----
  const attachmentPermissions = useMemo(() => {
    if (!profileId || !selectedTaskDetails) {
      return { canUpload: false, canDeleteAll: false };
    }

    const taskProjectOwnerId = selectedTaskDetails.projectOwnerId ?? projectOwnerId ?? null;
    const isProjectOwner = Boolean(taskProjectOwnerId && taskProjectOwnerId === profileId);
    const isProjectLead = chatMembers.some(
      (member) =>
        member.user_id === profileId &&
        (!selectedTaskDetails.projectId || !member.project_id || member.project_id === selectedTaskDetails.projectId) &&
        ["lead", "owner"].includes((member.role ?? "").toLowerCase()),
    );
    const isTaskCreator = Boolean(selectedTaskDetails.createdById && selectedTaskDetails.createdById === profileId);
    const isTaskAssignee =
      selectedTaskDetails.assignees?.some((a) => a.id === profileId) ?? false;
    const isAdminUser = isAdmin ?? false;

    // Upload: Project Owner, Project Lead, Task Creator, Task Assignee
    const canUpload = isProjectOwner || isProjectLead || isTaskCreator || isTaskAssignee || isAdminUser;

    // Delete all: Project Owner, Project Lead (uploader can always delete their own — handled in component)
    const canDeleteAll = isProjectOwner || isProjectLead || isAdminUser;

    return { canUpload, canDeleteAll };
  }, [profileId, selectedTaskDetails, projectOwnerId, isAdmin, chatMembers]);

  const canManageDependencies = attachmentPermissions.canUpload;

  const closeTaskDetails = useCallback(() => {
    setSelectedTaskDetails(null);
    setIsTitleExpanded(false);
    setIsDependenciesOpen(false);
    setIsReviewApprovalsOpen(false);
    setIsLinksOpen(false);
    setDependencyPendingCount(null);
    setReviewApprovalCounts(null);
    setLinksCount(null);
  }, []);

  const openTaskDetails = useCallback((seed: TaskDetailsSeed) => {
    setSelectedTaskDetails({
      id: seed.id,
      projectId: seed.projectId,
      title: seed.title,
      status: seed.status,
      assignee: seed.assignee ?? "Unassigned",
      assignees: seed.assignees ?? [],
      createdAt: seed.createdAt ?? null,
      createdByName: seed.createdByName ?? null,
      projectName: seed.projectName,
      projectOwnerId: seed.projectOwnerId ?? projectOwnerId ?? null,
      startDate: seed.startDate ?? null,
      endDate: seed.endDate ?? null,
      creator: seed.creator ?? null,
      description: seed.description ?? null,
      createdById: null, // Will be loaded from DB
      projectTimeZone: seed.projectTimeZone ?? DEFAULT_PROJECT_TIME_ZONE,
      normalWorkdayEnd: seed.normalWorkdayEnd ?? DEFAULT_PROJECT_WORKDAY_END,
    });
    setIsReviewApprovalsOpen(false);
    setReviewApprovalCounts(null);
  }, [projectOwnerId]);

  const loadTaskLogs = useCallback(async () => {
    try {
      setLogsLoading(true);

      if (!taskId) {
        setTaskLogs([]);
        return;
      }

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("created_by, description, title, start_date, end_date, project_id, projects(owner_id, time_zone, normal_workday_end)")
        .eq("id", taskId)
        .single();

      if (taskError) {
        console.error("Task details error:", taskError);
      }

      const taskDetails = (taskData as TaskDetailsRow | null) ?? null;
      const projectRelation = Array.isArray(taskDetails?.projects) ? taskDetails?.projects[0] ?? null : taskDetails?.projects ?? null;
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
          createdByName: createdByName || prev.createdByName,
          creator: {
            id: null,
            name: createdByName,
            email: null,
          },
          description: taskDetails?.description ?? prev.description,
          title: taskDetails?.title ?? prev.title,
          startDate: taskDetails?.start_date ?? prev.startDate,
          endDate: taskDetails?.end_date ?? prev.endDate,
          projectId: taskDetails?.project_id ?? prev.projectId,
          projectOwnerId: projectRelation?.owner_id ?? prev.projectOwnerId,
          projectTimeZone: projectRelation?.time_zone ?? prev.projectTimeZone,
          normalWorkdayEnd: projectRelation?.normal_workday_end ?? prev.normalWorkdayEnd,
          createdById: taskDetails?.created_by ?? prev.createdById,
        };
      });

      const { data: logsData, error: logsError } = await supabase
        .from("task_logs")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (logsError) {
        console.error("Task logs error:", logsError);
        setTaskLogs([]);
        return;
      }

      if (!logsData || logsData.length === 0) {
        setTaskLogs([]);
        return;
      }

      const userIds = [...new Set((logsData as TaskLogRow[]).map((log) => log.user_id).filter(Boolean))];
      let usersMap: Record<string, { id: string; name: string | null; email: string | null }> = {};

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", userIds as string[]);

        const safeUsers = (users as { id: string; name: string | null; email: string | null }[] | null) || [];
        usersMap = Object.fromEntries(safeUsers.map((u) => [u.id, u]));
      }

      const enrichedLogs = (logsData as TaskLogRow[]).map((log) => ({
        ...log,
        user: (log.user_id && usersMap[log.user_id]) || null,
      }));

      setTaskLogs(enrichedLogs);
    } catch (err) {
      console.error("Unexpected logs error:", err);
      setTaskLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskLogs();
    }
  }, [taskId, loadTaskLogs]);

  useEffect(() => {
    let isMounted = true;

    setDependencyPendingCount(null);
    setIsDependenciesOpen(false);

    if (!taskId) return;

    const loadDependencyCount = async () => {
      try {
        const { data, error } = await supabase.from("task_dependencies").select("status").eq("task_id", taskId);
        if (!isMounted) return;

        if (error) {
          setDependencyPendingCount(null);
          return;
        }

        const pendingCount = ((data as { status: string | null }[] | null) ?? []).filter((item) => item.status === "pending").length;
        setDependencyPendingCount(pendingCount);
      } catch {
        if (isMounted) {
          setDependencyPendingCount(null);
        }
      }
    };

    void loadDependencyCount();

    return () => {
      isMounted = false;
    };
  }, [supabase, taskId]);

  useEffect(() => {
    let isMounted = true;

    setReviewApprovalCounts(null);
    setIsReviewApprovalsOpen(false);

    const auth = supabase.auth;
    if (!taskId || !auth) return;

    const loadReviewCounts = async () => {
      try {
        const { data: sessionData } = await auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          if (isMounted) setReviewApprovalCounts({ reviewedCount: 0, totalCount: 0 });
          return;
        }

        const response = await fetch(`/api/tasks/${taskId}/review-approvals`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = (await response.json()) as { reviewedCount?: number; totalCount?: number };
        if (isMounted && response.ok) {
          setReviewApprovalCounts({
            reviewedCount: result.reviewedCount ?? 0,
            totalCount: result.totalCount ?? 0,
          });
        }
      } catch {
        if (isMounted) setReviewApprovalCounts({ reviewedCount: 0, totalCount: 0 });
      }
    };

    void loadReviewCounts();

    return () => {
      isMounted = false;
    };
  }, [supabase, taskId, selectedTaskDetails?.status]);

  useEffect(() => {
    let isMounted = true;

    setLinksCount(null);
    setIsLinksOpen(false);

    if (!taskId) return;

    const loadLinksCount = async () => {
      try {
        const { data, error } = await supabase.from("task_links").select("id").eq("task_id", taskId);
        if (!isMounted) return;

        if (error) {
          setLinksCount(null);
          return;
        }

        const count = ((data as { id: string }[] | null) ?? []).length;
        setLinksCount(count);
      } catch {
        if (isMounted) {
          setLinksCount(null);
        }
      }
    };

    void loadLinksCount();

    return () => {
      isMounted = false;
    };
  }, [supabase, taskId]);

  useEffect(() => {
    let isMounted = true;

    const loadProjectMembers = async () => {
      if (!projectId || members.length > 0) {
        if (isMounted) {
          setProjectMembers([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from("project_members")
        .select("project_id, user_id, role, user:users(id, name, email, avatar_url)")
        .eq("project_id", projectId);

      if (error) {
        if (isMounted) {
          setProjectMembers([]);
        }
        return;
      }

      const normalized = ((data as ProjectMemberRow[] | null | undefined) ?? [])
        .map((member) => {
          const user = Array.isArray(member.user) ? member.user[0] ?? null : member.user ?? null;
          return {
            project_id: member.project_id ?? projectId,
            user_id: member.user_id ?? user?.id ?? "",
            role: member.role ?? null,
            user,
          };
        })
        .filter((member) => Boolean(member.user_id));

      if (isMounted) {
        setProjectMembers(normalized);
      }
    };

    void loadProjectMembers();

    return () => {
      isMounted = false;
    };
  }, [members.length, projectId, supabase]);

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
            task_id,
            project_id,
            reply_to,
            users (
              id,
              name,
              email,
              avatar_url,
              job_role
            )
          `,
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

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
          user_id: update.user_id ?? "",
          task_id: update.task_id ?? taskId,
          project_id: update.project_id ?? selectedTaskDetails?.projectId ?? "",
          reply_to: update.reply_to ?? null,
          user: userRelation
            ? {
                id: userRelation.id,
                name: userRelation.name,
                email: userRelation.email,
                avatar_url: userRelation.avatar_url,
              }
            : null,
        };
      });

      setTaskUpdates(normalized);
    } catch {
      setTaskUpdates([]);
    }
  }, [supabase, taskId, selectedTaskDetails?.projectId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskUpdates();
      return;
    }

    setTaskUpdates([]);
  }, [taskId, loadTaskUpdates]);

  const handleCreateUpdate = useCallback(
    async (content: string) => {
      if (!selectedTaskDetails || !profileId) return;
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").insert({
          task_id: selectedTaskDetails.id,
          project_id: selectedTaskDetails.projectId,
          user_id: profileId,
          content,
        });
        await loadTaskUpdates();
        await onTaskUpdated?.();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, onTaskUpdated, profileId, selectedTaskDetails, supabase],
  );

  const handleEditUpdate = useCallback(
    async (id: string, content: string) => {
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").update({ content }).eq("id", id);
        await loadTaskUpdates();
        await onTaskUpdated?.();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, onTaskUpdated, supabase],
  );

  const handleDeleteUpdate = useCallback(
    async (id: string) => {
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").delete().eq("id", id);
        await loadTaskUpdates();
        await onTaskUpdated?.();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, onTaskUpdated, supabase],
  );

  const handleReply = useCallback(
    async (parentId: string, content: string) => {
      if (!selectedTaskDetails || !profileId) return;
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").insert({
          task_id: selectedTaskDetails.id,
          project_id: selectedTaskDetails.projectId,
          user_id: profileId,
          content,
          reply_to: parentId,
        });
        await loadTaskUpdates();
        await onTaskUpdated?.();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, onTaskUpdated, profileId, selectedTaskDetails, supabase],
  );

  const renderTaskDetails = () => (
    <>
      <Modal title="Task Details" isOpen={Boolean(selectedTaskDetails)} onClose={closeTaskDetails}>
        {selectedTaskDetails && (
          <div className="space-y-5 text-sm text-slate-700">
            <div className="space-y-2">
              <div className="min-w-0">
                <p
                  className={`text-xl font-bold leading-tight text-slate-900 break-words cursor-pointer transition-all ${
                    isTitleExpanded ? "" : "line-clamp-2"
                  }`}
                  onClick={() => setIsTitleExpanded((v) => !v)}
                  title={isTitleExpanded ? "Click to collapse" : "Click to expand full title"}
                >
                  {selectedTaskDetails.title}
                </p>
                {selectedTaskDetails.title.length > 80 && (
                  <button
                    type="button"
                    onClick={() => setIsTitleExpanded((v) => !v)}
                    className="mt-0.5 text-[11px] font-medium text-blue-500 hover:text-blue-700 transition"
                  >
                    {isTitleExpanded ? "Show less" : "Show more"}
                  </button>
                )}
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-500">
                  {selectedTaskDetails.status}
                </p>
              </div>

              {selectedTaskManHours ? <TaskManHoursPanel summary={selectedTaskManHours} variant="inline" /> : null}

              {showWorkingDaysPanel ? (
                <TaskWorkingDaysPanel
                  schedule={selectedSchedule}
                  loading={scheduleLoading}
                  error={scheduleError}
                  canManage={Boolean(selectedSchedule?.canManage && onEditWorkingDates)}
                  onRetry={() => { if (taskId) void taskSchedules.retry(taskId); }}
                  onEdit={() => { if (taskId) onEditWorkingDates?.(taskId); }}
                  className="min-[1700px]:hidden bg-slate-50/60 shadow-none"
                />
              ) : null}

              {selectedTaskDetails.description && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Description</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                    <LinkifiedText text={selectedTaskDetails.description} />
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-1">Assigned To</p>
                {(() => {
                  const assignees = selectedTaskDetails.assignees ?? [];
                  if (assignees.length === 0) return <p className="text-sm text-slate-600">Unassigned</p>;
                  const names = assignees.map((u) => u.name || "Unknown");
                  const display = names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
                  return (
                    <p className="text-sm text-slate-600" title={names.join(", ")}>
                      {display}
                    </p>
                  );
                })()}
              </div>

              <p className="text-xs text-slate-500">Created: {formatDateLabel(selectedTaskDetails.createdAt)}</p>
              {selectedTaskDetails.startDate && (
                <div>
                  <p className="text-xs text-gray-500">Start Date</p>
                  <p className="text-sm">{formatOptionalDate(selectedTaskDetails.startDate)}</p>
                </div>
              )}
              {selectedTaskDetails.endDate && (
                <div>
                  <p className="text-xs text-gray-500">Due Date</p>
                  <p className="text-sm">{formatOptionalDate(selectedTaskDetails.endDate)}</p>
                  <p className="text-xs text-slate-500">Due cutoff: {formatLocalTimeLabel(selectedTaskDetails.normalWorkdayEnd)} ({selectedTaskDetails.projectTimeZone})</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Created by</p>
                  <p className="mt-1 text-slate-900">{selectedTaskDetails.createdByName || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Project</p>
                  <p className="mt-1 text-slate-900">{selectedTaskDetails.projectName}</p>
                </div>
              </div>
            </div>

            <TaskWorkingScheduleSection
              key={selectedTaskDetails.id}
              taskId={selectedTaskDetails.id}
              taskTitle={selectedTaskDetails.title}
              taskStatus={selectedTaskDetails.status}
              startDate={selectedTaskDetails.startDate}
              dueDate={selectedTaskDetails.endDate}
              getAccessToken={getAccessToken}
              schedule={selectedSchedule}
              loading={scheduleLoading}
              loadError={scheduleError}
              onRetry={() => { void taskSchedules.retry(selectedTaskDetails.id); }}
              onChanged={(schedule) => {
                const dates = [...schedule.dates].sort();
                setSelectedTaskDetails((current) => current?.id === schedule.taskId
                  ? { ...current, startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null }
                  : current);
                if (onScheduleChanged) onScheduleChanged(schedule.taskId, schedule);
                else taskSchedules.update(schedule.taskId, schedule);
              }}
              onExtensionChanged={async () => {
                if (onExtensionChanged) await onExtensionChanged(selectedTaskDetails.id);
                else await taskSchedules.invalidate(selectedTaskDetails.id);
              }}
            />

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setIsDependenciesOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                aria-expanded={isDependenciesOpen}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    Key Dependencies / Pending Inputs
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Track client inputs, approvals, or blockers needed for this task.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {dependencyPendingCount !== null && (
                    <span className="inline-flex min-w-fit shrink-0 whitespace-nowrap items-center justify-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-700">
                      {dependencyPendingCount} pending
                    </span>
                  )}
                  {isDependenciesOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </span>
              </button>
              {isDependenciesOpen && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <TaskDependencies
                    supabase={supabase}
                    taskId={selectedTaskDetails.id}
                    projectId={selectedTaskDetails.projectId}
                    currentUserId={profileId}
                    canManageDependencies={canManageDependencies}
                    projectTimeZone={selectedTaskDetails.projectTimeZone}
                    normalWorkdayEnd={selectedTaskDetails.normalWorkdayEnd}
                    showHeader={false}
                    onPendingCountChange={setDependencyPendingCount}
                  />
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setIsReviewApprovalsOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                aria-expanded={isReviewApprovalsOpen}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    Review Approvals
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Track required project reviewer approvals for this review cycle.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {reviewApprovalCounts !== null && (
                    <span className="inline-flex min-w-fit shrink-0 whitespace-nowrap items-center justify-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-indigo-700">
                      {reviewApprovalCounts.reviewedCount} / {reviewApprovalCounts.totalCount} reviewed
                    </span>
                  )}
                  {isReviewApprovalsOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </span>
              </button>
              {isReviewApprovalsOpen && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <TaskReviewApprovals
                    supabase={supabase}
                    taskId={selectedTaskDetails.id}
                    projectId={selectedTaskDetails.projectId}
                    currentUserId={profileId}
                    taskStatus={selectedTaskDetails.status}
                    onCountsChange={setReviewApprovalCounts}
                    onReviewCompleted={loadTaskLogs}
                  />
                </div>
              )}
            </div>

            {/* Attachments — with permissions */}
            <TaskAttachments
              supabase={supabase}
              taskId={selectedTaskDetails.id}
              profileId={profileId}
              canUpload={attachmentPermissions.canUpload}
              canDeleteAll={attachmentPermissions.canDeleteAll}
            />

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setIsLinksOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                aria-expanded={isLinksOpen}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    Links / References
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Store task-related documents, references, or external links.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {linksCount !== null && linksCount > 0 && (
                    <span className="inline-flex min-w-fit shrink-0 whitespace-nowrap items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold leading-none text-slate-600">
                      {linksCount} {linksCount === 1 ? "link" : "links"}
                    </span>
                  )}
                  {isLinksOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </span>
              </button>
              {isLinksOpen && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <TaskLinks
                    supabase={supabase}
                    taskId={selectedTaskDetails.id}
                    projectId={selectedTaskDetails.projectId}
                    currentUserId={profileId}
                    canManageLinks={attachmentPermissions.canUpload}
                    showHeader={false}
                    onLinksCountChange={setLinksCount}
                  />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Activity Timeline</p>
              <div className="mt-3 max-h-[200px] overflow-y-auto pr-2 space-y-0">
                {logsLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Loading activity...
                  </div>
                ) : taskLogs.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No activity yet
                  </div>
                ) : (
                  taskLogs.map((log, index) => (
                    <div key={log.id} className="relative pl-7 pb-4">
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                      {index < taskLogs.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-slate-200" />}
                      <p className="mt-1 text-sm text-slate-800">{describeLog(log)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {log.user?.name || log.user?.email || "Unknown"} - {formatLogDate(log.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {selectedTaskDetails && (selectedTaskManHours || showWorkingDaysPanel) ? (
        <ModalPortal>
          <aside
            className="fixed right-[calc(50%+272px)] top-[5vh] z-[10000] hidden max-h-[90vh] w-[280px] flex-col gap-2.5 overflow-y-auto overscroll-contain min-[1700px]:flex"
            aria-label="Task schedule and man-hours"
          >
            {selectedTaskManHours ? <TaskManHoursPanel summary={selectedTaskManHours} variant="embedded" /> : null}
            {showWorkingDaysPanel ? (
              <TaskWorkingDaysPanel
                schedule={selectedSchedule}
                loading={scheduleLoading}
                error={scheduleError}
                canManage={Boolean(selectedSchedule?.canManage && onEditWorkingDates)}
                onRetry={() => { void taskSchedules.retry(selectedTaskDetails.id); }}
                onEdit={() => onEditWorkingDates?.(selectedTaskDetails.id)}
              />
            ) : null}
          </aside>
        </ModalPortal>
      ) : null}

      <ChatPanel
        isOpen={Boolean(selectedTaskDetails)}
        onClose={closeTaskDetails}
        taskTitle={selectedTaskDetails?.title ?? ""}
        taskUpdates={taskUpdates}
        members={chatMembers}
        profileId={profileId}
        canAddUpdate={canAddUpdate}
        canViewUpdates={canViewUpdates}
        isProjectOwnerMember={attachmentPermissions.canDeleteAll}
        isSuperAdmin={isAdmin ?? false}
        onCreateUpdate={handleCreateUpdate}
        onEditUpdate={handleEditUpdate}
        onDeleteUpdate={(id) => {
          void handleDeleteUpdate(id);
        }}
        onReply={handleReply}
        isSavingUpdate={isSubmittingUpdate}
      />
    </>
  );

  return {
    openTaskDetails,
    closeTaskDetails,
    selectedTaskDetails,
    renderTaskDetails,
    taskSchedules,
  };
}
