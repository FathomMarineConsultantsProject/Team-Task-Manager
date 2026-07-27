"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Users, LayoutDashboard, ChevronDown, ChevronUp, Search, SlidersHorizontal, X, FileDown, MoreHorizontal, Crown, UserMinus, Loader2 } from "lucide-react";
import { useExportTasks } from "@/lib/useExportTasks";
import BoardColumn from "@/components/board/BoardColumn";
import ProjectManHours from "@/components/board/ProjectManHours";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Avatar from "@/components/ui/Avatar";
import type { ColumnId, Task, TaskReviewProgress } from "@/components/board/types";
import { useAppData } from "@/components/providers/AppDataProvider";
import { createEmptyColumns } from "@/lib/data";
import CreateTaskAttachments from "@/components/tasks/CreateTaskAttachments";
import type { PendingAttachment } from "@/components/tasks/CreateTaskAttachments";
import { useTaskDetailsWorkflow } from "@/components/tasks/useTaskDetailsWorkflow";
import { addWorkingDays } from "@/lib/workingDays";
import { useProjectManHours } from "@/lib/useProjectManHours";
import type { LiveTaskManHoursSummary } from "@/lib/useProjectManHours";
import TaskWorkingDatesCalendar from "@/components/tasks/TaskWorkingDatesCalendar";
import WorkdayExtensionModal from "@/components/tasks/WorkdayExtensionModal";
import type { TaskWorkingSchedule } from "@/lib/manHours";
import {
  addDaysToDateOnly,
  compareDateOnly,
  formatProjectDate,
  getEffectiveTaskDueAt,
  getProjectLocalDate,
  getProjectTimeSettings,
  getSignedDaysRemaining,
  getTaskDueState,
  isDateOnly,
  listDateOnlyRange,
  parseTimeOnly,
} from "@/lib/projectDateTime";

type DbTask = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  draft_review_started_at: string | null;
  draft_review_due_at: string | null;
  completed_at?: string | null;
};

type DbUser = {
  id: string;
  name: string | null;
  email: string | null;
  job_role: string | null;
  system_role?: string | null;
  avatar_url: string | null;
};

type DbProject = {
  id: string;
  name: string | null;
  description: string | null;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  time_zone: string;
  normal_workday_start: string;
  normal_workday_end: string;
  created_at?: string | null;
  owner?: {
    id: string | null;
    email: string | null;
  }[] | null;
  project_members?: {
    user_id: string | null;
    role: string | null;
    users: {
      id: string | null;
      email: string | null;
    }[];
  }[] | null;
};

type DbProjectMember = {
  user_id: string;
  role: string | null;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      job_role: string | null;
      system_role?: string | null;
      avatar_url: string | null;
    } | null;
};

type ProjectReviewer = {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    job_role: string | null;
    avatar_url?: string | null;
  } | null;
};

type StatusUpdateResult = {
  task?: {
    id: string;
    status: string | null;
    progress?: number | null;
    completed_at: string | null;
    updated_at: string | null;
    draft_review_started_at: string | null;
    draft_review_due_at: string | null;
  };
  error?: string;
  pendingReviewers?: string[];
};

type StatusUpdateOutcome =
  | { success: true; task?: StatusUpdateResult["task"] }
  | { success: false; error: string; pendingReviewers?: string[] };

type TaskReviewRow = {
  task_id: string | null;
  reviewer_id: string | null;
  status: string | null;
};

const BOARD_COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: "todo", title: "TO DO" },
  { id: "inProgress", title: "IN PROGRESS" },
  { id: "draftReview", title: "DRAFT REVIEW" },
  { id: "review", title: "IN REVIEW" },
  { id: "done", title: "DONE" },
];

const STATUS_TO_COLUMN: Record<string, ColumnId> = {
  todo: "todo",
  in_progress: "inProgress",
  draft_review: "draftReview",
  in_review: "review",
  done: "done",
};

const COLUMN_TO_STATUS: Record<ColumnId, "todo" | "in_progress" | "draft_review" | "in_review" | "done"> = {
  todo: "todo",
  inProgress: "in_progress",
  draftReview: "draft_review",
  review: "in_review",
  done: "done",
};

const COLUMN_ACCENT: Record<ColumnId, string> = {
  todo: "bg-orange-500",
  inProgress: "bg-sky-500",
  draftReview: "bg-cyan-500",
  review: "bg-amber-500",
  done: "bg-emerald-600",
};

const STATUS_LABEL: Record<ColumnId, string> = {
  todo: "TODO",
  inProgress: "IN PROGRESS",
  draftReview: "DRAFT REVIEW",
  review: "IN REVIEW",
  done: "DONE",
};

const COLUMN_EXPORT_LABEL: Record<ColumnId, string> = {
  todo: "To Do",
  inProgress: "In Progress",
  draftReview: "Draft Review",
  review: "In Review",
  done: "Done",
};

const getDraftReviewDateFields = (enteredAt = new Date()) => ({
  draft_review_started_at: enteredAt.toISOString(),
  draft_review_due_at: addWorkingDays(enteredAt, 5).toISOString(),
});

const normalizeRole = (role: string | null | undefined) => (role ?? "").toLowerCase();

const resolveColumn = (status: string | null | undefined): ColumnId => {
  if (!status) {
    return "todo";
  }
  return STATUS_TO_COLUMN[status] ?? "todo";
};

const buildInitials = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const pieces = trimmedName.split(/\s+/).filter(Boolean).slice(0, 2);
    if (pieces.length > 0) {
      return pieces.map((piece) => piece.charAt(0).toUpperCase()).join("");
    }
  }

  const emailPrefix = email?.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  if (emailPrefix.length >= 2) {
    return emailPrefix.slice(0, 2).toUpperCase();
  }

  return "NA";
};

const formatProjectOverviewDate = (value: string | null | undefined) => {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatWorkingDate = (value: string | null, timeZone: string) => value
  ? formatProjectDate(value, timeZone, { day: "2-digit", month: "short", year: "numeric" })
  : "—";

const formatWorkdayTime = (value: string) => {
  const time = parseTimeOnly(value);
  if (!time) return value;
  return `${time.hour % 12 || 12}:${String(time.minute).padStart(2, "0")} ${time.hour >= 12 ? "PM" : "AM"}`;
};

const legacyWorkingDates = (task: Task, projectToday: string) => {
  if (task.start_date && task.end_date && compareDateOnly(task.end_date, task.start_date) >= 0) {
    const latest = addDaysToDateOnly(task.start_date, 365);
    return listDateOnlyRange(
      task.start_date,
      compareDateOnly(task.end_date, latest) > 0 ? latest : task.end_date,
    );
  }
  if (task.start_date) return [task.start_date];
  return [projectToday];
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
};

export default function ProjectBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params?.projectId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkTaskId = searchParams?.get("taskId");
  const hasOpenedDeepLinkRef = React.useRef(false);
  const { supabase, profile } = useAppData();

  // Board state (existing)
  const [columns, setColumns] = useState<Record<ColumnId, Task[]>>(createEmptyColumns);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ taskId: string; from: ColumnId } | null>(null);
  const [pendingStatusTaskIds, setPendingStatusTaskIds] = useState<Set<string>>(() => new Set());

  // Project state (new)
  const [project, setProject] = useState<DbProject | null>(null);
  const [members, setMembers] = useState<DbProjectMember[]>([]);
  const [reviewers, setReviewers] = useState<ProjectReviewer[]>([]);
  const [projectLoading, setProjectLoading] = useState(true);

  // Modal state (new)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showProjectOverviewModal, setShowProjectOverviewModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<ColumnId>("todo");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskWorkingDates, setNewTaskWorkingDates] = useState<string[]>([]);
  const [workingDatesDirty, setWorkingDatesDirty] = useState(false);
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [extensionTask, setExtensionTask] = useState<{ task: Task; summary: LiveTaskManHoursSummary } | null>(null);
  const [newMemberSearch, setNewMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DbUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskUpdateCounts, setTaskUpdateCounts] = useState<Record<string, number>>({});
  const [reviewProgressByTaskId, setReviewProgressByTaskId] = useState<Record<string, TaskReviewProgress>>({});
  const [reviewProgressRefreshVersion, setReviewProgressRefreshVersion] = useState(0);
  const [manHoursRefreshKey, setManHoursRefreshKey] = useState(0);
  const manHours = useProjectManHours(projectId, manHoursRefreshKey);
  const [selectedAdditionalAssignees, setSelectedAdditionalAssignees] = useState<DbUser[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSavingEdit2, setIsSavingEdit2] = useState(false);
  const [editWorkingDates, setEditWorkingDates] = useState<string[]>([]);
  const [editOriginalWorkingDates, setEditOriginalWorkingDates] = useState<string[]>([]);
  const [editScheduleState, setEditScheduleState] = useState<"configured" | "legacy" | null>(null);
  const [editScheduleLoading, setEditScheduleLoading] = useState(false);
  const [editScheduleError, setEditScheduleError] = useState<string | null>(null);
  const [unreadTaskNotifs, setUnreadTaskNotifs] = useState<Record<string, number>>({});
  const [timerNow, setTimerNow] = useState<number | null>(null);

  // Part 2 - Team collapse
  const [teamExpanded, setTeamExpanded] = useState(false);
  // Part 3 - Pipeline search
  const [boardSearch, setBoardSearch] = useState("");
  // Part 4 - Sort & filter
  const [boardSort, setBoardSort] = useState<"default" | "created" | "start" | "due" | "alpha" | "near_due" | "overdue">("default");
  const [boardTimeFilter, setBoardTimeFilter] = useState<"all" | "today" | "week" | "month" | "overdue" | "near_due" | "completed">("all");
  const [boardMemberFilter, setBoardMemberFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [managingMemberId, setManagingMemberId] = useState<string | null>(null);
  const [projectTeamTab, setProjectTeamTab] = useState<"add" | "manage" | "reviewer">("add");
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [openTeamMemberMenuId, setOpenTeamMemberMenuId] = useState<string | null>(null);
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<DbProjectMember | null>(null);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [managingReviewerId, setManagingReviewerId] = useState<string | null>(null);

  const projectTimeSettings = useMemo(() => getProjectTimeSettings({
    timeZone: manHours.data?.timeZone ?? project?.time_zone,
    normalWorkdayStart: manHours.data?.normalWorkdayStart ?? project?.normal_workday_start,
    normalWorkdayEnd: manHours.data?.normalWorkdayEnd ?? project?.normal_workday_end,
  }), [manHours.data?.normalWorkdayEnd, manHours.data?.normalWorkdayStart, manHours.data?.timeZone, project?.normal_workday_end, project?.normal_workday_start, project?.time_zone]);
  const projectTimeZone = projectTimeSettings.timeZone;
  const projectWorkdayEnd = projectTimeSettings.normalWorkdayEnd;
  const boardNow = useMemo(() => new Date(timerNow ?? Date.now()), [timerNow]);
  const projectToday = useMemo(
    () => getProjectLocalDate(projectTimeZone, boardNow),
    [boardNow, projectTimeZone],
  );
  const newTaskBounds = useMemo(() => {
    const dates = [...new Set(newTaskWorkingDates)].sort();
    return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
  }, [newTaskWorkingDates]);
  const editTaskBounds = useMemo(() => {
    const dates = [...new Set(editWorkingDates)].sort();
    return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
  }, [editWorkingDates]);
  const workingDatesValidation = useMemo(() => {
    if (newTaskWorkingDates.length === 0) return "Select at least one working date.";
    if (newTaskWorkingDates.length > 366) return "Select no more than 366 working dates.";
    if (newTaskWorkingDates.some((date) => !isDateOnly(date))) return "Working dates must use YYYY-MM-DD.";
    return null;
  }, [newTaskWorkingDates]);

  useEffect(() => {
    if (!showCreateTaskModal || workingDatesDirty) return;
    setNewTaskWorkingDates([projectToday]);
  }, [projectToday, showCreateTaskModal, workingDatesDirty]);

  // Excel export hook
  const { isExporting, handleExportTasks } = useExportTasks({
    supabase,
    projectId,
    projectName: project?.name ?? null,
    members: members.map((m) => ({ user_id: m.user_id, user: m.user })),
    timeZone: project?.time_zone,
    normalWorkdayEnd: project?.normal_workday_end,
  });

  const systemRole = normalizeRole(profile?.system_role ?? profile?.role);
  const isOwner = Boolean(project?.owner_id && profile?.id && project.owner_id === profile.id);
  const isProjectLead = Boolean(
    profile?.id &&
      members.some((member) => member.user_id === profile.id && normalizeRole(member.role) === "lead"),
  );
  const isSuperAdmin = systemRole === "super_admin";
  const isAdmin = systemRole === "admin";
  const canManageProject = isOwner || isAdmin || isSuperAdmin;
  const canManageProjectMembers = isOwner || isProjectLead || isAdmin || isSuperAdmin;
  const canRemoveProjectMembers = isAdmin || isSuperAdmin;
  const isProjectMember = Boolean(profile?.id && members.some((member) => member.user_id === profile.id));
  const isProjectOwnerMember = Boolean(
    profile?.id &&
      members.some((member) => member.user_id === profile.id && normalizeRole(member.role) === "owner"),
  );
  const canExtendTaskWorkday = useCallback((task: Task) => Boolean(
    profile?.id
    && (
      isOwner
      || isProjectLead
      || isAdmin
      || isSuperAdmin
      || task.assigneeId === profile.id
      || task.assignees?.some((assignee) => assignee.id === profile.id)
    )
  ), [isAdmin, isOwner, isProjectLead, isSuperAdmin, profile?.id]);
  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);
  const canViewTaskUpdates = isProjectMember || canManageProject;
  const canParticipateInTaskUpdates = isProjectMember || isProjectOwnerMember || isSuperAdmin;

  const loadProjectReviewers = useCallback(async () => {
    if (!projectId) {
      setReviewers([]);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setReviewers([]);
        return;
      }

      const response = await fetch(`/api/projects/${projectId}/reviewers`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as { reviewers?: ProjectReviewer[]; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load project reviewers.");
      }

      setReviewers(result.reviewers ?? []);
    } catch (error) {
      console.error("Failed to load project reviewers", error);
      setReviewers([]);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    void loadProjectReviewers();
  }, [loadProjectReviewers]);

  useEffect(() => {
    setTimerNow(Date.now());
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!openTeamMemberMenuId) {
      return;
    }

    const closeMenu = () => setOpenTeamMemberMenuId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [openTeamMemberMenuId]);

  const timerStart = useMemo(() => {
    const value = project?.start_date || project?.created_at || null;
    return value ? new Date(value).getTime() : null;
  }, [project?.start_date, project?.created_at]);

  const filteredUsers = useMemo(() => {
    const search = newMemberSearch.trim().toLowerCase();
    const memberIds = new Set(members.map((member) => member.user_id));

    if (!search) {
      return [];
    }

    return directoryUsers
      .filter((user) => !memberIds.has(user.id))
      .filter((user) => {
        const name = user.name?.toLowerCase() ?? "";
        const role = user.job_role?.toLowerCase() ?? "";
        return name.includes(search) || role.includes(search);
      })
      .slice(0, 8);
  }, [directoryUsers, members, newMemberSearch]);

  const filteredTeamMembers = useMemo(() => {
    const search = teamMemberSearch.trim().toLowerCase();

    if (!search) {
      return members;
    }

    return members.filter((member) => {
      const user = member.user;
      const name = user?.name?.toLowerCase() ?? "";
      const email = user?.email?.toLowerCase() ?? "";
      const jobRole = user?.job_role?.toLowerCase() ?? "";
      const systemRoleValue = user?.system_role?.toLowerCase() ?? "";
      const memberRole = member.role?.toLowerCase() ?? "";

      return (
        name.includes(search) ||
        email.includes(search) ||
        jobRole.includes(search) ||
        systemRoleValue.includes(search) ||
        memberRole.includes(search)
      );
    });
  }, [members, teamMemberSearch]);

  const filteredReviewerMembers = useMemo(() => {
    const search = reviewerSearch.trim().toLowerCase();
    const reviewerIds = new Set(reviewers.map((reviewer) => reviewer.user_id));
    const eligibleMembers = members.filter((member) => member.user && !reviewerIds.has(member.user_id));

    if (!search) {
      return eligibleMembers;
    }

    return eligibleMembers
      .filter((member) => {
        const user = member.user;
        if (!user) return false;
        const name = user.name?.toLowerCase() ?? "";
        const email = user.email?.toLowerCase() ?? "";
        const role = user.job_role?.toLowerCase() ?? "";
        const projectRole = member.role?.toLowerCase() ?? "";
        return name.includes(search) || email.includes(search) || role.includes(search) || projectRole.includes(search);
      })
      .slice(0, 8);
  }, [members, reviewerSearch, reviewers]);

  const reviewerNames = useMemo(
    () =>
      reviewers
        .map((reviewer) => reviewer.user?.name ?? reviewer.user?.email ?? null)
        .filter((name): name is string => Boolean(name)),
    [reviewers],
  );

  const canMoveTask = useCallback(
    (assignedTo: string | null, assignees?: { id: string }[], startDate?: string | null) => {
      if (!profile?.id) return false;

      // Project owner, project lead, admin, or super admin can move tasks.
      if (canManageProject || isProjectLead) return true;

      const isAssignee = assignedTo === profile.id;
      const isMultiAssignee = assignees?.some(u => u.id === profile.id) ?? false;

      if (!isAssignee && !isMultiAssignee) return false;

      // Date lock: future tasks cannot be moved
      if (startDate) {
        if (startDate > projectToday) return false;
      }

      return true;
    },
    [profile?.id, canManageProject, isProjectLead, projectToday],
  );

  const insertTaskLog = useCallback(
    async ({
      taskId,
      action,
      fromStatus,
      toStatus,
      userId,
    }: {
      taskId: string;
      action: "moved" | "assigned" | "created";
      fromStatus?: string | null;
      toStatus?: string | null;
      userId: string;
    }) => {
      const { error } = await supabase.from("task_logs").insert([
        {
          task_id: taskId,
          action,
          from_status: fromStatus ?? null,
          to_status: toStatus ?? null,
          user_id: userId,
        },
      ]);

      if (error) {
        console.error("Task logs error:", error);
      }
    },
    [supabase],
  );

  const initializeTaskReviewCycle = useCallback(
    async (taskId: string) => {
      if (!taskId || !projectId) return;

      const { error: deleteError } = await supabase
        .from("task_reviewer_reviews")
        .delete()
        .eq("task_id", taskId);

      if (deleteError) {
        console.error("Failed to reset task review cycle", deleteError);
        return;
      }

      const { data: reviewerRows, error: reviewerError } = await supabase
        .from("project_reviewers")
        .select("user_id")
        .eq("project_id", projectId);

      if (reviewerError) {
        console.error("Failed to load project reviewers for task review cycle", reviewerError);
        return;
      }

      const rows = ((reviewerRows as { user_id: string | null }[] | null) ?? [])
        .filter((row): row is { user_id: string } => Boolean(row.user_id))
        .map((row) => ({
          task_id: taskId,
          project_id: projectId,
          reviewer_id: row.user_id,
          status: "pending",
          reviewed_at: null,
        }));

      if (rows.length === 0) return;

      const { error: insertError } = await supabase.from("task_reviewer_reviews").insert(rows);
      if (insertError) {
        console.error("Failed to initialize task review cycle", insertError);
      }
    },
    [projectId, supabase],
  );

  const applyTaskUpdateCounts = useCallback(
    (nextColumns: Record<ColumnId, Task[]>) => {
      const countedColumns = createEmptyColumns();

      BOARD_COLUMNS.forEach((column) => {
        countedColumns[column.id] = nextColumns[column.id].map((task) => ({
          ...task,
          updatesCount: taskUpdateCounts[task.id] ?? 0,
        }));
      });

      return countedColumns;
    },
    [taskUpdateCounts],
  );

  const loadTaskUpdateCounts = useCallback(async () => {
    if (!projectId) {
      setTaskUpdateCounts({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("task_updates")
        .select("task_id")
        .eq("project_id", projectId);

      if (error) {
        setTaskUpdateCounts({});
        return;
      }

      const rows = ((data as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
        (row): row is { task_id: string } => Boolean(row.task_id),
      );

      const counts = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
        return acc;
      }, {});

      setTaskUpdateCounts(counts);
    } catch {
      setTaskUpdateCounts({});
    }
  }, [projectId, supabase]);

  const inReviewTaskIds = useMemo(() => columns.review.map((task) => task.id), [columns.review]);

  useEffect(() => {
    let isMounted = true;

    const loadReviewProgress = async () => {
      if (!profile?.id || inReviewTaskIds.length === 0) {
        if (isMounted) setReviewProgressByTaskId({});
        return;
      }

      try {
        const { data, error } = await supabase
          .from("task_reviewer_reviews")
          .select("task_id, reviewer_id, status")
          .in("task_id", inReviewTaskIds);

        if (error) {
          if (isMounted) setReviewProgressByTaskId({});
          return;
        }

        const nextProgress = ((data as TaskReviewRow[] | null | undefined) ?? []).reduce<Record<string, TaskReviewProgress>>(
          (acc, row) => {
            if (!row.task_id) return acc;
            const current = acc[row.task_id] ?? {
              total: 0,
              reviewed: 0,
              pending: 0,
              currentUserStatus: null,
            };
            const isReviewed = row.status === "reviewed";
            current.total += 1;
            current.reviewed += isReviewed ? 1 : 0;
            current.pending += isReviewed ? 0 : 1;
            if (row.reviewer_id === profile.id) {
              current.currentUserStatus = isReviewed ? "reviewed" : "pending";
            }
            acc[row.task_id] = current;
            return acc;
          },
          {},
        );

        if (isMounted) {
          setReviewProgressByTaskId(nextProgress);
        }
      } catch {
        if (isMounted) setReviewProgressByTaskId({});
      }
    };

    void loadReviewProgress();

    return () => {
      isMounted = false;
    };
  }, [inReviewTaskIds, profile?.id, reviewProgressRefreshVersion, supabase]);

  const { openTaskDetails, renderTaskDetails } = useTaskDetailsWorkflow({
    supabase,
    profileId: profile?.id ?? null,
    members: members.map((member) => ({
      project_id: projectId,
      user_id: member.user_id,
      role: member.role,
      user: member.user
        ? {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            avatar_url: member.user.avatar_url,
          }
        : null,
    })),
    projectOwnerId: project?.owner_id ?? null,
    isAdmin: isAdmin || isSuperAdmin,
    canAddUpdate: canParticipateInTaskUpdates,
    canViewUpdates: canViewTaskUpdates,
    onTaskUpdated: loadTaskUpdateCounts,
    onManHoursChanged: (change) => {
      if (change) {
        setColumns((current) => {
          const next = { ...current };
          BOARD_COLUMNS.forEach((column) => {
            next[column.id] = next[column.id].map((task) => task.id === change.taskId
              ? {
                  ...task,
                  start_date: change.startDate,
                  end_date: change.endDate,
                  canDrag: canMoveTask(task.assigneeId ?? null, task.assignees, change.startDate),
                }
              : task);
          });
          return next;
        });
      }
      setManHoursRefreshKey((value) => value + 1);
    },
    manHoursByTaskId: manHours.taskSummaryById,
  });

  const handleOpenTaskDetails = useCallback(
    async (taskId: string, column: ColumnId) => {
      const task = columns[column].find((item) => item.id === taskId);
      if (!task) {
        return;
      }

      let createdAt: string | null = null;
      let startDateValue: string | null = null;
      let endDateValue: string | null = null;
      let descriptionValue: string | null = null;
      let createdByIdValue: string | null = null;

      try {
        const { data, error } = await supabase
          .from("tasks")
          .select("created_at, start_date, end_date, description, created_by")
          .eq("id", taskId)
          .eq("project_id", projectId)
          .single();

        if (!error) {
          createdAt = (data as any)?.created_at ?? null;
          startDateValue = (data as any)?.start_date ?? null;
          endDateValue = (data as any)?.end_date ?? null;
          descriptionValue = (data as any)?.description ?? null;
          createdByIdValue = (data as any)?.created_by ?? null;
        }
      } catch {
        createdAt = null;
        startDateValue = null;
        endDateValue = null;
        descriptionValue = null;
        createdByIdValue = null;
      }

      openTaskDetails({
        id: task.id,
        projectId,
        title: task.title,
        description: descriptionValue,
        status: COLUMN_TO_STATUS[column],
        assignee: task.assigneeName ?? task.assigneeEmail ?? "Unassigned",
        createdAt,
        createdByName: null,
        projectName: project?.name ?? "Untitled project",
        projectOwnerId: project?.owner_id ?? null,
        startDate: startDateValue,
        endDate: endDateValue,
        assignees: task.assignees ?? [],
        creator: createdByIdValue ? { id: createdByIdValue, name: null, email: null } : null,
        projectTimeZone,
        normalWorkdayEnd: projectWorkdayEnd,
      });
    },
    [columns, openTaskDetails, project?.name, project?.owner_id, projectId, projectTimeZone, projectWorkdayEnd, supabase],
  );

  // Fetch project and members (new)
  useEffect(() => {
    let isMounted = true;

    const loadProjectAndMembers = async () => {
      if (!projectId) {
        if (isMounted) {
          setProject(null);
          setMembers([]);
          setProjectLoading(false);
        }
        return;
      }

      try {
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select(
            `
              id,
              name,
              description,
              owner_id,
              start_date,
              end_date,
              time_zone,
              normal_workday_start,
              normal_workday_end,
              created_at,
              owner:users!projects_owner_id_fkey (
                id,
                email
              ),
              project_members(
                user_id,
                role,
                users (
                  id,
                  name,
                  job_role,
                  system_role,
                  email
                )
              )
            `,
          )
          .eq("id", projectId)
          .single();

        if (projectError) {
          throw projectError;
        }

        const { data: membersData, error: membersError } = await supabase
          .from("project_members")
          .select(
            `
              user_id,
              role,
              user:users(id, name, email, job_role, system_role, avatar_url)
            `,
          )
          .eq("project_id", projectId);

        if (membersError) {
          throw membersError;
        }

        if (isMounted) {
          setProject(projectData as DbProject);
          setMembers(((membersData as unknown) as DbProjectMember[]) ?? []);
        }
      } catch (error) {
        console.error("Failed to load project details", error);
        if (isMounted) {
          setProject(null);
          setMembers([]);
        }
      } finally {
        if (isMounted) {
          setProjectLoading(false);
        }
      }
    };

    void loadProjectAndMembers();

    return () => {
      isMounted = false;
    };
  }, [projectId, supabase]);

  // Handlers for create task and add member (new)
  const handleCreateTask = useCallback(
    async (title: string) => {
      if (!title.trim() || !projectId || workingDatesValidation) {
        setCreateTaskError(workingDatesValidation ?? "Task title is required.");
        return;
      }

      setIsSubmitting(true);
      setCreateTaskError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const currentUserId = sessionData.session?.user?.id ?? profile?.id;
        if (!token || !currentUserId) throw new Error("Please sign in again to create tasks.");

        const response = await fetch(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: newTaskDescription.trim() || null,
            status: COLUMN_TO_STATUS[newTaskStatus],
            primaryAssigneeId: newTaskAssignee || null,
            additionalAssigneeIds: selectedAdditionalAssignees.map((user) => user.id),
            workingDates: newTaskWorkingDates,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "Failed to create task.");
        const newTask = result.task as DbTask | undefined;
        if (!newTask) throw new Error("Task creation returned no task.");

          if (newTask.status === "in_review") {
            await initializeTaskReviewCycle(newTask.id);
          }

          const additionalAssigneesToInsert = selectedAdditionalAssignees.filter((user) => user.id !== newTask.assigned_to);

          const columnId = resolveColumn(newTask.status);
          const assignee = newTask.assigned_to
            ? members.find((m) => m.user_id === newTask.assigned_to)?.user
            : undefined;

          // Build assignees array: primary + additional
          const primaryUser = assignee ? { id: assignee.id, name: assignee.name ?? null, email: assignee.email ?? null, avatar_url: assignee.avatar_url ?? null } : null;
          const assignees = [
            ...(primaryUser ? [primaryUser] : []),
            ...additionalAssigneesToInsert.map(u => ({ id: u.id, name: u.name ?? null, email: u.email ?? null, avatar_url: u.avatar_url ?? null })),
          ];

          setColumns((prev) => ({
            ...prev,
            [columnId]: [
              {
                id: newTask.id,
                title: newTask.title?.trim() || "Untitled task",
                description: newTask.description ?? null,
                accent: COLUMN_ACCENT[columnId],
                initials: buildInitials(assignee?.name, assignee?.email),
                assigneeId: newTask.assigned_to,
                assigneeName: assignee?.name ?? null,
                assigneeEmail: assignee?.email ?? null,
                assigneeRole: assignee?.job_role ?? null,
                avatarUrl: assignee?.avatar_url ?? null,
                start_date: newTask.start_date ?? null,
                end_date: newTask.end_date ?? null,
                draft_review_started_at: newTask.draft_review_started_at ?? null,
                draft_review_due_at: newTask.draft_review_due_at ?? null,
                statusLabel: STATUS_LABEL[columnId],
                canDrag: canMoveTask(newTask.assigned_to, assignees, newTask.start_date),
                assignees,
              },
              ...prev[columnId],
            ],
          }));

          // ---- Upload pending attachments ----
          if (pendingAttachments.length > 0) {
            const failedUploads: string[] = [];
            for (const pending of pendingAttachments) {
              try {
                const timestamp = Date.now();
                const safeName = pending.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                const storagePath = `${newTask.id}/${timestamp}_${safeName}`;

                const { error: uploadErr } = await supabase.storage
                  .from("task-attachments")
                  .upload(storagePath, pending.file, {
                    upsert: false,
                    contentType: pending.file.type || "application/octet-stream",
                  });

                if (uploadErr) {
                  failedUploads.push(pending.name);
                  console.error("Attachment upload failed:", pending.name, uploadErr);
                  continue;
                }

                const { error: insertErr } = await supabase
                  .from("task_attachments")
                  .insert({
                    task_id: newTask.id,
                    file_name: pending.file.name,
                    storage_path: storagePath,
                    mime_type: pending.file.type || "application/octet-stream",
                    file_size: pending.file.size,
                    uploaded_by: currentUserId,
                  });

                if (insertErr) {
                  // Rollback storage
                  await supabase.storage.from("task-attachments").remove([storagePath]);
                  failedUploads.push(pending.name);
                  console.error("Attachment metadata insert failed:", pending.name, insertErr);
                }
              } catch (attachErr) {
                failedUploads.push(pending.name);
                console.error("Attachment upload error:", pending.name, attachErr);
              }
            }

            if (failedUploads.length > 0) {
              alert(`Task created successfully, but some attachments failed to upload: ${failedUploads.join(", ")}`);
            }
          }
        setNewTaskTitle("");
        setNewTaskAssignee("");
        setNewTaskStatus("todo");
        setNewTaskDescription("");
        setSelectedAdditionalAssignees([]);
        setNewTaskWorkingDates([]);
        setWorkingDatesDirty(false);
        setPendingAttachments([]);
        setShowCreateTaskModal(false);
        setManHoursRefreshKey((value) => value + 1);
      } catch (error) {
        console.error("Failed to create task:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        setCreateTaskError(errorMsg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, workingDatesValidation, supabase, profile?.id, newTaskDescription, newTaskStatus, newTaskAssignee, selectedAdditionalAssignees, newTaskWorkingDates, initializeTaskReviewCycle, members, canMoveTask, pendingAttachments],
  );

  const handleAddMembers = useCallback(
    async () => {
      if (!projectId) {
        return;
      }

      if (!canManageProjectMembers) {
        alert("Only the project owner, project lead, admin, or super admin can add members.");
        console.warn("Unauthorized: Non-manager attempted to add member");
        return;
      }

      const existingMemberIds = new Set(members.map((member) => member.user_id));
      const newUserIds = selectedMemberIds.filter((userId) => !existingMemberIds.has(userId));

      if (newUserIds.length === 0) {
        setSelectedMemberIds([]);
        alert("Selected users are already members of this project.");
        return;
      }

      setIsSubmitting(true);

      try {
        console.log("Adding users to project:", { userIds: newUserIds, projectId });

        const { error: memberError } = await supabase.from("project_members").insert(
          newUserIds.map((userId) => ({
            project_id: projectId,
            user_id: userId,
            role: "member",
          })),
        );

        if (memberError) {
          console.error("Member insert error:", memberError);
          throw memberError;
        }

        console.log("Members added successfully");
        setNewMemberSearch("");
        setSelectedMemberIds([]);
        setShowAddMemberModal(false);

        // Reload members
        const { data: updatedMembers } = await supabase
          .from("project_members")
          .select(
            `
              user_id,
              role,
              user:users(id, name, email, job_role, system_role, avatar_url)
            `,
          )
          .eq("project_id", projectId);

        setMembers(((updatedMembers as unknown) as DbProjectMember[]) ?? []);
      } catch (error) {
        console.error("Failed to add member:", error);
        alert(error instanceof Error ? error.message : "Failed to add member. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, supabase, canManageProjectMembers, members, selectedMemberIds],
  );

  const handleAddReviewer = useCallback(
    async () => {
      if (!projectId || !selectedReviewerId) {
        return;
      }

      if (!canManageProjectMembers) {
        alert("Only project owners, leads, admins, or super admins can assign reviewers.");
        return;
      }

      setManagingReviewerId(selectedReviewerId);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          alert("Please sign in again to manage project reviewers.");
          return;
        }

        const response = await fetch(`/api/projects/${projectId}/reviewers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId: selectedReviewerId }),
        });
        const result = (await response.json()) as { reviewer?: ProjectReviewer; error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to assign project reviewer.");
        }

        await loadProjectReviewers();

        if (!members.some((member) => member.user_id === selectedReviewerId)) {
          const { data: updatedMembers } = await supabase
            .from("project_members")
            .select(
              `
              user_id,
              role,
              user:users(id, name, email, job_role, system_role, avatar_url)
            `,
            )
            .eq("project_id", projectId);

          setMembers(((updatedMembers as unknown) as DbProjectMember[]) ?? []);
        }

        setReviewerSearch("");
        setSelectedReviewerId("");
      } catch (error) {
        console.error("Failed to assign reviewer", error);
        alert(error instanceof Error ? error.message : "Failed to assign project reviewer.");
      } finally {
        setManagingReviewerId(null);
      }
    },
    [canManageProjectMembers, loadProjectReviewers, members, projectId, selectedReviewerId, supabase],
  );

  const handleRemoveReviewer = useCallback(
    async (userId: string) => {
      if (!projectId || !userId) {
        return;
      }

      if (!canManageProjectMembers) {
        alert("Only project owners, leads, admins, or super admins can remove reviewers.");
        return;
      }

      setManagingReviewerId(userId);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          alert("Please sign in again to manage project reviewers.");
          return;
        }

        const response = await fetch(`/api/projects/${projectId}/reviewers/${userId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to remove project reviewer.");
        }

        setReviewers((current) => current.filter((reviewer) => reviewer.user_id !== userId));
      } catch (error) {
        console.error("Failed to remove reviewer", error);
        alert(error instanceof Error ? error.message : "Failed to remove project reviewer.");
      } finally {
        setManagingReviewerId(null);
      }
    },
    [canManageProjectMembers, projectId, supabase],
  );

  const handlePromoteMember = useCallback(
    async (userId: string) => {
      if (!userId || !projectId) {
        return;
      }

      if (!canManageProjectMembers) {
        alert("Only project managers can promote project leads.");
        return;
      }

      setManagingMemberId(userId);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          alert("Please sign in again to manage project members.");
          return;
        }

        const response = await fetch(`/api/projects/${projectId}/members/promote-lead`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId }),
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to promote member to project lead.");
        }

        setMembers((current) =>
          current.map((member) => (member.user_id === userId ? { ...member, role: "lead" } : member)),
        );
        setOpenTeamMemberMenuId(null);
      } catch (error) {
        console.error("Failed to promote member", error);
        alert(error instanceof Error ? error.message : "Failed to promote member to project lead.");
      } finally {
        setManagingMemberId(null);
      }
    },
    [projectId, supabase, canManageProjectMembers],
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!userId || !projectId) {
        return;
      }

      if (!canRemoveProjectMembers) {
        alert("Only admins can remove project members.");
        return;
      }

      setManagingMemberId(userId);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          alert("Please sign in again to manage project members.");
          return;
        }

        const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to remove member from project.");
        }

        setMembers((current) => current.filter((member) => member.user_id !== userId));
        setSelectedAdditionalAssignees((current) => current.filter((user) => user.id !== userId));
        if (newTaskAssignee === userId) {
          setNewTaskAssignee("");
        }
        setBoardMemberFilter((current) => (current === userId ? "all" : current));
        setColumns((current) => {
          const next = createEmptyColumns();
          (Object.keys(current) as ColumnId[]).forEach((columnId) => {
            next[columnId] = current[columnId].map((task) => {
              const updatedAssignees = task.assignees?.filter((assignee) => assignee.id !== userId);
              return {
                ...task,
                assigneeId: task.assigneeId === userId ? null : task.assigneeId,
                assigneeName: task.assigneeId === userId ? "Unassigned" : task.assigneeName,
                assigneeRole: task.assigneeId === userId ? null : task.assigneeRole,
                assignees: updatedAssignees,
              };
            });
          });
          return next;
        });
        setOpenTeamMemberMenuId(null);
      } catch (error) {
        console.error("Failed to remove member", error);
        alert(error instanceof Error ? error.message : "Failed to remove member from project.");
      } finally {
        setManagingMemberId(null);
        setMemberPendingRemoval(null);
      }
    },
    [projectId, supabase, canRemoveProjectMembers, newTaskAssignee],
  );

  const requestRemoveMember = useCallback((member: DbProjectMember) => {
    setMemberPendingRemoval(member);
    setOpenTeamMemberMenuId(null);
  }, []);

  const confirmRemoveMember = useCallback(() => {
    if (!memberPendingRemoval) {
      return;
    }

    void handleRemoveMember(memberPendingRemoval.user_id);
  }, [handleRemoveMember, memberPendingRemoval]);

  useEffect(() => {
    if (!showAddMemberModal) {
      return;
    }

    let isMounted = true;

    const loadDirectoryUsers = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, job_role, system_role, avatar_url")
        .order("name", { ascending: true });

      if (error) {
        console.error("Failed to load users for member search", error);
        return;
      }

      if (isMounted) {
        setDirectoryUsers(((data as DbUser[] | null | undefined) ?? []));
      }
    };

    void loadDirectoryUsers();

    return () => {
      isMounted = false;
    };
  }, [showAddMemberModal, supabase]);

  useEffect(() => {
    let isMounted = true;

    const loadBoard = async () => {
      if (!projectId) {
        if (isMounted) {
          setColumns(createEmptyColumns());
          setErrorMessage("Missing project identifier");
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
      }

      try {
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("id, title, description, status, assigned_to, start_date, end_date, draft_review_started_at, draft_review_due_at, completed_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false, nullsFirst: false });

        if (taskError) {
          throw taskError;
        }

        let updatesMap: Record<string, number> = {};
        try {
          const { data: updatesData, error: updatesError } = await supabase
            .from("task_updates")
            .select("task_id")
            .eq("project_id", projectId);

          if (!updatesError) {
            updatesMap = (((updatesData as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
              (row): row is { task_id: string } => Boolean(row.task_id),
            )).reduce<Record<string, number>>((acc, row) => {
              acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
              return acc;
            }, {});

            if (isMounted) {
              setTaskUpdateCounts(updatesMap);
            }
          }
        } catch {
          updatesMap = {};
        }

        try {
          const { data: updatesData, error: updatesError } = await supabase
            .from("task_updates")
            .select("task_id")
            .eq("project_id", projectId);

          if (!updatesError) {
            const updatesMap = (((updatesData as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
              (row): row is { task_id: string } => Boolean(row.task_id),
            )).reduce<Record<string, number>>((acc, row) => {
              acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
              return acc;
            }, {});

            if (isMounted) {
              setTaskUpdateCounts(updatesMap);
            }
          }
        } catch {
          // Silent fallback: counts are optional and should not block board rendering.
        }

        const assignedIds = Array.from(
          new Set(
            ((taskRows as DbTask[] | null | undefined) ?? [])
              .map((task) => task.assigned_to)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        let usersById: Record<string, DbUser> = {};

        if (assignedIds.length > 0) {
          const { data: userRows, error: userError } = await supabase
            .from("users")
            .select("id, name, email, job_role, system_role, avatar_url")
            .in("id", assignedIds);

          if (userError) {
            throw userError;
          }

          usersById = ((userRows as DbUser[] | null | undefined) ?? []).reduce<Record<string, DbUser>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }

        const groupedColumns = createEmptyColumns();

        // Fetch multi-assignees for all tasks
        const allTaskIds = ((taskRows as DbTask[] | null | undefined) ?? []).map(t => t.id);
        let assigneesMap: Record<string, { id: string; name: string | null; email: string | null }[]> = {};
        if (allTaskIds.length > 0) {
          try {
            const { data: assigneesData } = await supabase
              .from("task_assignees")
              .select("task_id, user:users(id, name, email, avatar_url)")
              .in("task_id", allTaskIds);

            if (assigneesData) {
              (assigneesData as any[]).forEach((row: any) => {
                if (!row.task_id || !row.user) return;
                if (!assigneesMap[row.task_id]) assigneesMap[row.task_id] = [];
                assigneesMap[row.task_id].push(row.user);
              });
            }
          } catch {
            // task_assignees table may not exist yet — fail silently
          }
        }

        ((taskRows as DbTask[] | null | undefined) ?? []).forEach((row) => {
          const columnId = resolveColumn(row.status);
          const assignee = row.assigned_to ? usersById[row.assigned_to] : undefined;

          // Build multi-assignee list: primary + additional (deduplicated)
          const multiUsers = assigneesMap[row.id] ?? [];
          const primaryUser = assignee ? { id: assignee.id, name: assignee.name ?? null, email: assignee.email ?? null, avatar_url: assignee.avatar_url ?? null } : null;
          const assignees = [
            ...(primaryUser ? [primaryUser] : []),
            ...multiUsers.filter(u => u.id !== primaryUser?.id),
          ];

          groupedColumns[columnId] = [
            ...groupedColumns[columnId],
            {
              id: row.id,
              title: row.title?.trim() || "Untitled task",
              description: row.description,
              accent: COLUMN_ACCENT[columnId],
              initials: buildInitials(assignee?.name, assignee?.email),
              assigneeId: row.assigned_to,
              assigneeName: assignee?.name ?? null,
              assigneeEmail: assignee?.email ?? null,
              assigneeRole: assignee?.job_role ?? null,
              avatarUrl: assignee?.avatar_url ?? null,
              start_date: row.start_date,
              end_date: row.end_date,
              draft_review_started_at: row.draft_review_started_at,
              draft_review_due_at: row.draft_review_due_at,
              completed_at: row.completed_at,
              statusLabel: STATUS_LABEL[columnId],
              canDrag: canMoveTask(row.assigned_to, assignees, row.start_date),
              updatesCount: updatesMap[row.id] ?? 0,
              assignees,
            },
          ];
        });

        if (isMounted) {
          setColumns(groupedColumns);
          setErrorMessage(null);
        }
      } catch (error) {
        console.error("Failed to load board", error);
        if (isMounted) {
          setColumns(createEmptyColumns());
          setErrorMessage("Failed to load board tasks.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const handleAiTaskCreated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId !== projectId) return;
      void loadBoard();
    };

    window.addEventListener("ai-task-created", handleAiTaskCreated);
    void loadBoard();

    return () => {
      isMounted = false;
      window.removeEventListener("ai-task-created", handleAiTaskCreated);
    };
  }, [canMoveTask, projectId, supabase]);

  useEffect(() => {
    void loadTaskUpdateCounts();
  }, [loadTaskUpdateCounts]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    setColumns((current) => applyTaskUpdateCounts(current));
  }, [applyTaskUpdateCounts, projectId, taskUpdateCounts]);

  const onTaskDragStart = useCallback(
    (taskId: string, from: ColumnId) => {
      if (pendingStatusTaskIds.has(taskId)) {
        return;
      }

      const task = columns[from].find((item) => item.id === taskId);
      const canMove = canMoveTask(task?.assigneeId ?? null, task?.assignees, task?.start_date);

      if (!canMove) {
        console.warn("Unauthorized action");
        return;
      }

      setActiveDrag({ taskId, from });
    },
    [columns, canMoveTask, pendingStatusTaskIds],
  );

  const onTaskDragEnd = useCallback(() => {
    setActiveDrag(null);
    setDragOverColumn(null);
  }, []);

  const updateTaskStatus = useCallback(
    async (taskId: string, destination: ColumnId, source: ColumnId): Promise<StatusUpdateOutcome> => {
      const sourceTask = columns[source].find((task) => task.id === taskId);
      const canMove = canMoveTask(sourceTask?.assigneeId ?? null, sourceTask?.assignees, sourceTask?.start_date);

      if (!canMove) {
        console.warn("Unauthorized action");
        return { success: false, error: "You do not have permission to update this task status." };
      }

      const nextStatus = COLUMN_TO_STATUS[destination];

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          return { success: false, error: "Please sign in again to update task status." };
        }

        const response = await fetch(`/api/tasks/${taskId}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        const result = (await response.json()) as StatusUpdateResult;

        if (!response.ok) {
          return {
            success: false,
            error: result.error ?? "Failed to update task status.",
            pendingReviewers: result.pendingReviewers,
          };
        }

        return { success: true, task: result.task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update task status.",
        };
      }
    },
    [supabase, columns, canMoveTask],
  );

  const onColumnDrop = useCallback(
    (destination: ColumnId) => {
      if (!activeDrag) {
        return;
      }

      const { taskId, from } = activeDrag;

      if (pendingStatusTaskIds.has(taskId)) {
        setActiveDrag(null);
        setDragOverColumn(null);
        return;
      }

      if (from === destination) {
        setActiveDrag(null);
        setDragOverColumn(null);
        return;
      }

      const sourceTask = columns[from].find((task) => task.id === taskId);
      const canMove = canMoveTask(sourceTask?.assigneeId ?? null, sourceTask?.assignees, sourceTask?.start_date);
      if (!sourceTask || !canMove) {
        console.warn("Unauthorized action");
        setActiveDrag(null);
        setDragOverColumn(null);
        return;
      }

      const originalIndex = columns[from].findIndex((task) => task.id === taskId);
      const optimisticTask: Task = {
        ...sourceTask,
        status: COLUMN_TO_STATUS[destination],
        statusLabel: STATUS_LABEL[destination],
        accent: COLUMN_ACCENT[destination],
      };

      setPendingStatusTaskIds((current) => {
        const next = new Set(current);
        next.add(taskId);
        return next;
      });

      // Optimistic move: update the board before waiting for the status API.
      setColumns((current) => ({
        ...current,
        [from]: current[from].filter((task) => task.id !== taskId),
        [destination]: [
          optimisticTask,
          ...current[destination].filter((task) => task.id !== taskId),
        ],
      }));

      void (async () => {
        try {
          const result = await updateTaskStatus(taskId, destination, from);

          if (!result.success) {
            // Roll back only this task so other concurrent task moves are preserved.
            setColumns((current) => {
              const withoutTask = createEmptyColumns();
              BOARD_COLUMNS.forEach((column) => {
                withoutTask[column.id] = current[column.id].filter((task) => task.id !== taskId);
              });
              const sourceTasks = withoutTask[from];
              const rollbackIndex = Math.max(0, Math.min(originalIndex, sourceTasks.length));

              return {
                ...withoutTask,
                [from]: [
                  ...sourceTasks.slice(0, rollbackIndex),
                  sourceTask,
                  ...sourceTasks.slice(rollbackIndex),
                ],
              };
            });

            const pendingNames = result.pendingReviewers?.filter(Boolean) ?? [];
            alert(
              pendingNames.length > 0
                ? `Pending reviews: ${pendingNames.join(", ")}`
                : result.error ?? "All assigned reviewers must complete their review before this task can be moved to Done.",
            );
            return;
          }

          setManHoursRefreshKey((current) => current + 1);

          if (result.task) {
            const updatedTask = result.task;
            setColumns((current) => ({
              ...current,
              [destination]: current[destination].map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      status: updatedTask.status,
                      ...(updatedTask.progress !== undefined ? { progress: updatedTask.progress } : {}),
                      completed_at: updatedTask.completed_at,
                      updated_at: updatedTask.updated_at,
                      draft_review_started_at: updatedTask.draft_review_started_at,
                      draft_review_due_at: updatedTask.draft_review_due_at,
                    }
                  : task,
              ),
            }));
          }

          if (from === "review" || destination === "review") {
            setReviewProgressRefreshVersion((current) => current + 1);
          }
        } finally {
          setPendingStatusTaskIds((current) => {
            const next = new Set(current);
            next.delete(taskId);
            return next;
          });
        }
      })();
      setActiveDrag(null);
      setDragOverColumn(null);
    },
    [activeDrag, canMoveTask, columns, pendingStatusTaskIds, updateTaskStatus],
  );

  const onRemoveTask = useCallback((taskId: string, column: ColumnId) => {
    setColumns((current) => ({
      ...current,
      [column]: current[column].filter((task) => task.id !== taskId),
    }));
  }, []);

  const onDeleteTask = useCallback(
    async (taskId: string, column: ColumnId) => {
      const existingTask = columns[column].find((task) => task.id === taskId);
      if (!existingTask) {
        return;
      }

      // Permission: owner/admin OR assignee (primary or multi)
      const isAssignee = existingTask.assigneeId === profile?.id;
      const isMultiAssignee = existingTask.assignees?.some(u => u.id === profile?.id);
      const canDelete = canManageProject || isAssignee || isMultiAssignee;

      if (!canDelete) {
        alert("You don't have permission to delete this task.");
        return;
      }

      setColumns((current) => ({
        ...current,
        [column]: current[column].filter((task) => task.id !== taskId),
      }));

      console.log("Deleting task:", { taskId, projectId });

      const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("project_id", projectId);

      if (error) {
        console.error("Task delete error:", error);
        setColumns((current) => ({
          ...current,
          [column]: [...current[column], existingTask],
        }));
      } else {
        console.log("Task deleted successfully");
      }
    },
    [columns, projectId, supabase, canManageProject, profile?.id],
  );

  const handleMarkTaskReviewed = useCallback(
    async (taskId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        alert("Please sign in again to mark your review complete.");
        return;
      }

      const response = await fetch(`/api/tasks/${taskId}/review-approvals/mark-reviewed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        alert(result.error ?? "Failed to mark review complete.");
        return;
      }

      setReviewProgressByTaskId((current) => {
        const progress = current[taskId];
        if (!progress || progress.currentUserStatus !== "pending") {
          return current;
        }

        return {
          ...current,
          [taskId]: {
            ...progress,
            reviewed: progress.reviewed + 1,
            pending: Math.max(0, progress.pending - 1),
            currentUserStatus: "reviewed",
          },
        };
      });
      setReviewProgressRefreshVersion((current) => current + 1);
    },
    [supabase],
  );

  const findTaskFromColumns = useCallback(
    (taskId: string): Task | null => {
      for (const col of BOARD_COLUMNS) {
        const found = columns[col.id].find((t) => t.id === taskId);
        if (found) return found;
      }
      return null;
    },
    [columns],
  );

  const closeEditTask = useCallback(() => {
    setEditingTask(null);
    setEditWorkingDates([]);
    setEditOriginalWorkingDates([]);
    setEditScheduleState(null);
    setEditScheduleError(null);
  }, []);

  const loadEditWorkingDates = useCallback(async (task: Task) => {
    setEditScheduleLoading(true);
    setEditScheduleError(null);
    setEditScheduleState(null);
    setEditWorkingDates([]);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again to load working dates.");
      const response = await fetch(`/api/tasks/${task.id}/working-dates`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const schedule = await response.json().catch(() => ({})) as TaskWorkingSchedule & { error?: string };
      if (!response.ok) throw new Error(schedule.error ?? "Unable to load working dates.");
      const dates = schedule.scheduleState === "configured"
        ? schedule.dates
        : legacyWorkingDates(task, schedule.todayLocalDate || projectToday);
      setEditWorkingDates(dates);
      setEditOriginalWorkingDates(dates);
      setEditScheduleState(schedule.scheduleState);
    } catch (error) {
      setEditScheduleError(error instanceof Error ? error.message : "Unable to load working dates.");
    } finally {
      setEditScheduleLoading(false);
    }
  }, [projectToday, supabase]);

  const handleEditTask = useCallback(
    async (taskId: string) => {
      const task = findTaskFromColumns(taskId);
      if (!task) return;

      // Permission check
      const canEdit =
        canManageProject ||
        task.assigneeId === profile?.id ||
        task.assignees?.some(u => u.id === profile?.id);

      if (!canEdit) {
        alert("You don't have permission to edit this task.");
        return;
      }

      setEditingTask({ ...task, description: task.description ?? null });
      void loadEditWorkingDates(task);
      void supabase
          .from("tasks")
          .select("description")
          .eq("id", taskId)
          .eq("project_id", projectId)
          .single()
          .then(({ data }) => {
            setEditingTask((current) => current?.id === taskId
              ? { ...current, description: (data as { description?: string | null } | null)?.description ?? null }
              : current);
          });
    },
    [findTaskFromColumns, canManageProject, profile?.id, loadEditWorkingDates, supabase, projectId],
  );

  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return;
    if (!editingTask.title.trim()) {
      setEditScheduleError("Task title is required.");
      return;
    }
    if (!editWorkingDates.length) {
      setEditScheduleError("Select at least one working date.");
      return;
    }

    setIsSavingEdit2(true);
    setEditScheduleError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again to update this task.");
      const response = await fetch(`/api/tasks/${editingTask.id}/working-dates`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingTask.title.trim(),
          description: editingTask.description ?? null,
          dates: editWorkingDates,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to update task.");

      setColumns((prev) => {
        const updated = { ...prev };
        BOARD_COLUMNS.forEach((col) => {
          updated[col.id] = updated[col.id].map((task) => {
            if (task.id !== editingTask.id) return task;
            return {
              ...task,
              title: editingTask.title.trim(),
              description: editingTask.description,
              start_date: editTaskBounds.start,
              end_date: editTaskBounds.end,
              canDrag: canMoveTask(task.assigneeId ?? null, task.assignees, editTaskBounds.start),
            };
          });
        });
        return updated;
      });
      setManHoursRefreshKey((value) => value + 1);
      closeEditTask();
    } catch (err) {
      console.error("Failed to update task", err);
      setEditScheduleError(err instanceof Error ? err.message : "Failed to update task.");
    } finally {
      setIsSavingEdit2(false);
    }
  }, [canMoveTask, closeEditTask, editTaskBounds.end, editTaskBounds.start, editWorkingDates, editingTask, supabase]);

  const claimTask = useCallback(
    async (taskId: string) => {
      if (!profile?.id) {
        return;
      }

      let previousAssignee: string | null = null;
      BOARD_COLUMNS.forEach((column) => {
        const foundTask = columns[column.id].find((task) => task.id === taskId);
        if (foundTask) {
          previousAssignee = foundTask.assigneeId ?? null;
        }
      });

      const sourceTask = findTaskFromColumns(taskId);
      const additionalAssigneeIds = (sourceTask?.assignees ?? [])
        .map((assignee) => assignee.id)
        .filter((userId) => userId !== profile.id && userId !== previousAssignee);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        alert("Please sign in again to claim this task.");
        return;
      }

      const response = await fetch(`/api/tasks/${taskId}/assignees`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          primaryAssigneeId: profile.id,
          additionalAssigneeIds,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        console.error("Failed to claim task", result.error);
        alert(result.error ?? "Failed to claim task.");
        return;
      }

      setManHoursRefreshKey((current) => current + 1);

      if (previousAssignee !== profile.id) {
        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData.user?.id;
        if (!currentUserId) {
          console.error("Task log insert skipped: missing authenticated user");
          return;
        }

        await insertTaskLog({
          taskId,
          action: "assigned",
          fromStatus: null,
          toStatus: null,
          userId: currentUserId,
        });
      }

      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select("id, title, description, status, assigned_to, start_date, end_date, draft_review_started_at, draft_review_due_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false, nullsFirst: false });

      if (taskError) {
        console.error("Failed to refresh tasks", taskError);
        return;
      }

      let updatesMap: Record<string, number> = {};
      try {
        const { data: updatesData, error: updatesError } = await supabase
          .from("task_updates")
          .select("task_id")
          .eq("project_id", projectId);

        if (!updatesError) {
          updatesMap = (((updatesData as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
            (row): row is { task_id: string } => Boolean(row.task_id),
          )).reduce<Record<string, number>>((acc, row) => {
            acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
            return acc;
          }, {});

          setTaskUpdateCounts(updatesMap);
        }
      } catch {
        updatesMap = {};
      }

      const assignedIds = Array.from(
        new Set(
          ((taskRows as DbTask[] | null | undefined) ?? [])
            .map((task) => task.assigned_to)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      let usersById: Record<string, DbUser> = {};

      if (assignedIds.length > 0) {
        const { data: userRows, error: userError } = await supabase
          .from("users")
          .select("id, name, email, job_role, system_role, avatar_url")
          .in("id", assignedIds);

        if (userError) {
          console.error("Failed to refresh users", userError);
          return;
        }

        usersById = ((userRows as DbUser[] | null | undefined) ?? []).reduce<Record<string, DbUser>>((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      }

      const groupedColumns = createEmptyColumns();

      // Fetch multi-assignees for all tasks
      const claimTaskIds = ((taskRows as DbTask[] | null | undefined) ?? []).map(t => t.id);
      let claimAssigneesMap: Record<string, { id: string; name: string | null; email: string | null }[]> = {};
      if (claimTaskIds.length > 0) {
        try {
          const { data: assigneesData } = await supabase
            .from("task_assignees")
            .select("task_id, user:users(id, name, email, avatar_url)")
            .in("task_id", claimTaskIds);

          if (assigneesData) {
            (assigneesData as any[]).forEach((row: any) => {
              if (!row.task_id || !row.user) return;
              if (!claimAssigneesMap[row.task_id]) claimAssigneesMap[row.task_id] = [];
              claimAssigneesMap[row.task_id].push(row.user);
            });
          }
        } catch {
          // task_assignees table may not exist yet — fail silently
        }
      }

      ((taskRows as DbTask[] | null | undefined) ?? []).forEach((row) => {
        const columnId = resolveColumn(row.status);
        const assignee = row.assigned_to ? usersById[row.assigned_to] : undefined;

        // Build multi-assignee list: primary + additional (deduplicated)
        const multiUsers = claimAssigneesMap[row.id] ?? [];
        const primaryUser = assignee ? { id: assignee.id, name: assignee.name ?? null, email: assignee.email ?? null, avatar_url: assignee.avatar_url ?? null } : null;
        const assignees = [
          ...(primaryUser ? [primaryUser] : []),
          ...multiUsers.filter(u => u.id !== primaryUser?.id),
        ];

        groupedColumns[columnId] = [
          ...groupedColumns[columnId],
          {
            id: row.id,
            title: row.title?.trim() || "Untitled task",
            description: row.description,
            accent: COLUMN_ACCENT[columnId],
            initials: buildInitials(assignee?.name, assignee?.email),
            assigneeId: row.assigned_to,
            assigneeName: assignee?.name ?? null,
            assigneeEmail: assignee?.email ?? null,
            assigneeRole: assignee?.job_role ?? null,
            avatarUrl: assignee?.avatar_url ?? null,
            start_date: row.start_date,
            end_date: row.end_date,
            draft_review_started_at: row.draft_review_started_at,
            draft_review_due_at: row.draft_review_due_at,
            statusLabel: STATUS_LABEL[columnId],
            canDrag: canMoveTask(row.assigned_to, assignees, row.start_date),
            updatesCount: updatesMap[row.id] ?? 0,
            assignees,
          },
        ];
      });

      setColumns(groupedColumns);
    },
    [profile?.id, supabase, projectId, canMoveTask, columns, insertTaskLog, findTaskFromColumns],
  );

  useEffect(() => {
    let isMounted = true;

    const loadBoard = async () => {
      if (!projectId) {
        if (isMounted) {
          setColumns(createEmptyColumns());
          setErrorMessage("Missing project identifier");
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
      }

      try {
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("id, title, description, status, assigned_to, start_date, end_date, draft_review_started_at, draft_review_due_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false, nullsFirst: false });

        if (taskError) {
          throw taskError;
        }

        let updatesMap: Record<string, number> = {};
        try {
          const { data: updatesData, error: updatesError } = await supabase
            .from("task_updates")
            .select("task_id")
            .eq("project_id", projectId);

          if (!updatesError) {
            updatesMap = (((updatesData as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
              (row): row is { task_id: string } => Boolean(row.task_id),
            )).reduce<Record<string, number>>((acc, row) => {
              acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
              return acc;
            }, {});

            if (isMounted) {
              setTaskUpdateCounts(updatesMap);
            }
          }
        } catch {
          updatesMap = {};
        }

        try {
          const { data: updatesData, error: updatesError } = await supabase
            .from("task_updates")
            .select("task_id")
            .eq("project_id", projectId);

          if (!updatesError) {
            const updatesMap = (((updatesData as Array<{ task_id: string | null }> | null | undefined) ?? []).filter(
              (row): row is { task_id: string } => Boolean(row.task_id),
            )).reduce<Record<string, number>>((acc, row) => {
              acc[row.task_id] = (acc[row.task_id] ?? 0) + 1;
              return acc;
            }, {});

            if (isMounted) {
              setTaskUpdateCounts(updatesMap);
            }
          }
        } catch {
          // Silent fallback: counts are optional and should not block board rendering.
        }

        const assignedIds = Array.from(
          new Set(
            ((taskRows as DbTask[] | null | undefined) ?? [])
              .map((task) => task.assigned_to)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        let usersById: Record<string, DbUser> = {};

        if (assignedIds.length > 0) {
          const { data: userRows, error: userError } = await supabase
            .from("users")
            .select("id, name, email, job_role, system_role, avatar_url")
            .in("id", assignedIds);

          if (userError) {
            throw userError;
          }

          usersById = ((userRows as DbUser[] | null | undefined) ?? []).reduce<Record<string, DbUser>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }

        const groupedColumns = createEmptyColumns();

        // Fetch multi-assignees for all tasks
        const allTaskIds2 = ((taskRows as DbTask[] | null | undefined) ?? []).map(t => t.id);
        let assigneesMap2: Record<string, { id: string; name: string | null; email: string | null }[]> = {};
        if (allTaskIds2.length > 0) {
          try {
            const { data: assigneesData } = await supabase
              .from("task_assignees")
              .select("task_id, user:users(id, name, email, avatar_url)")
              .in("task_id", allTaskIds2);

            if (assigneesData) {
              (assigneesData as any[]).forEach((row: any) => {
                if (!row.task_id || !row.user) return;
                if (!assigneesMap2[row.task_id]) assigneesMap2[row.task_id] = [];
                assigneesMap2[row.task_id].push(row.user);
              });
            }
          } catch {
            // task_assignees table may not exist yet — fail silently
          }
        }

        ((taskRows as DbTask[] | null | undefined) ?? []).forEach((row) => {
          const columnId = resolveColumn(row.status);
          const assignee = row.assigned_to ? usersById[row.assigned_to] : undefined;

          // Build multi-assignee list: primary + additional (deduplicated)
          const multiUsers = assigneesMap2[row.id] ?? [];
          const primaryUser = assignee ? { id: assignee.id, name: assignee.name ?? null, email: assignee.email ?? null, avatar_url: assignee.avatar_url ?? null } : null;
          const assignees = [
            ...(primaryUser ? [primaryUser] : []),
            ...multiUsers.filter(u => u.id !== primaryUser?.id),
          ];

          groupedColumns[columnId] = [
            ...groupedColumns[columnId],
            {
              id: row.id,
              title: row.title?.trim() || "Untitled task",
              description: row.description,
              accent: COLUMN_ACCENT[columnId],
              initials: buildInitials(assignee?.name, assignee?.email),
              assigneeId: row.assigned_to,
              assigneeName: assignee?.name ?? null,
              assigneeEmail: assignee?.email ?? null,
              assigneeRole: assignee?.job_role ?? null,
              avatarUrl: assignee?.avatar_url ?? null,
              start_date: row.start_date,
              end_date: row.end_date,
              draft_review_started_at: row.draft_review_started_at,
              draft_review_due_at: row.draft_review_due_at,
              statusLabel: STATUS_LABEL[columnId],
              canDrag: canMoveTask(row.assigned_to, assignees, row.start_date),
              updatesCount: updatesMap[row.id] ?? 0,
              assignees,
            },
          ];
        });

        if (isMounted) {
          setColumns(groupedColumns);
          setErrorMessage(null);
        }
      } catch (error) {
        console.error("Failed to load board", error);
        if (isMounted) {
          setColumns(createEmptyColumns());
          setErrorMessage("Failed to load board tasks.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadBoard();

    return () => {
      isMounted = false;
    };
  }, [canMoveTask, projectId, supabase]);

  // Deep linking for task ID
  useEffect(() => {
    if (!loading && deepLinkTaskId && !hasOpenedDeepLinkRef.current) {
      let foundColumn: ColumnId | null = null;
      for (const col of BOARD_COLUMNS) {
        if (columns[col.id]?.some(t => t.id === deepLinkTaskId)) {
          foundColumn = col.id;
          break;
        }
      }

      if (foundColumn) {
        hasOpenedDeepLinkRef.current = true;
        void handleOpenTaskDetails(deepLinkTaskId, foundColumn);

        // Remove the parameter from URL to prevent reopening on subsequent closes
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("taskId");
          window.history.replaceState({}, "", url.toString());
        } catch { /* silent */ }
      } else {
        // If it wasn't found but we finished loading, mark as checked so we don't keep trying
        hasOpenedDeepLinkRef.current = true;
      }
    }
  }, [loading, deepLinkTaskId, columns, handleOpenTaskDetails]);

  if (!projectId) {
    return <div className="p-6 text-sm text-red-600">Missing project identifier</div>;
  }

  return (
    <div className="space-y-6 p-8">
      {/* PROJECT HEADER + TEAM CONTAINER */}
      {projectLoading ? (
        <div className="text-xs text-slate-500">Loading project...</div>
      ) : project ? (
        <div className="rounded-xl border border-slate-200 p-6">
          <div className="space-y-4">
            {/* HEADER: Title + Description + Buttons */}
            <div className="flex items-start justify-between">
              <button
                type="button"
                title="View project details"
                onClick={() => setShowProjectOverviewModal(true)}
                className="-m-2 flex-1 cursor-pointer rounded-lg p-2 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <h1 className="text-4xl font-bold tracking-[-0.02em] text-slate-900">{project.name || "Untitled Project"}</h1>
                {project.description ? (
                  <p className="mt-1 text-sm text-slate-600 hover:underline">{project.description}</p>
                ) : null}
                {(project.start_date || project.end_date) && (
                  <p className="text-sm text-slate-500 mt-1">
                    {project.start_date && `Start: ${new Date(project.start_date).toLocaleDateString()}`}
                    {" "}
                    {project.end_date && `• Due: ${formatProjectDate(project.end_date, projectTimeZone)}`}
                  </p>
                )}
              </button>
              <div className="ml-8 flex flex-col items-end gap-2">
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white/80 px-3 py-2 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.5)] backdrop-blur-sm -translate-y-2">
                  {(timerStart && timerNow !== null) ? (
                    (() => {
                      const parts = formatDuration(timerNow - timerStart);
                      const cells = [
                        { label: "DAYS", value: parts.days },
                        { label: "HRS", value: parts.hours },
                        { label: "MIN", value: parts.minutes },
                        { label: "SEC", value: parts.seconds },
                      ];
                      return cells.map((cell) => (
                        <div key={cell.label} className="min-w-[52px] rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-center">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400/90 leading-none mb-1">{cell.label}</p>
                          <p className="text-[15px] font-bold tabular-nums text-slate-800 leading-none">{cell.value}</p>
                        </div>
                      ));
                    })()
                  ) : (
                    ["DAYS", "HRS", "MIN", "SEC"].map((label) => (
                      <div key={label} className="min-w-[52px] rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-center">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400/90 leading-none mb-1">{label}</p>
                        <p className="text-[15px] font-bold tabular-nums text-slate-800 leading-none">--</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <LayoutDashboard size={16} />
                    Dashboard
                  </Button>
                  {canManageProjectMembers && (
                    <Button
                      onClick={() => {
                        setProjectTeamTab("add");
                        setShowAddMemberModal(true);
                      }}
                      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Users size={16} />
                      Team
                    </Button>
                  )}
                  <Button
                    onClick={() => void handleExportTasks()}
                    disabled={isExporting}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <FileDown size={16} />
                    {isExporting ? "Exporting…" : "Export Tasks"}
                  </Button>
                  <Button
                    onClick={() => {
                      setNewTaskStatus("todo");
                      setWorkingDatesDirty(false);
                      setCreateTaskError(null);
                      setShowCreateTaskModal(true);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <Plus size={16} />
                    Create Task
                  </Button>
                </div>
              </div>
            </div>

            {/* TEAM SECTION - Collapsible: header-only when collapsed */}
            {!projectLoading && members.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setTeamExpanded((p) => !p)}
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-700 transition"
                >
                  Team ({members.length})
                  {teamExpanded
                    ? <ChevronUp size={14} className="text-slate-400" />
                    : <ChevronDown size={14} className="text-slate-400" />
                  }
                </button>
                {teamExpanded && (
                  <div className="mt-3 flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {members.map((member) => {
                      const user = member.user;
                      if (!user) return null;
                      const isOwnerMember = member.user_id === project.owner_id;
                      const isLeadMember = normalizeRole(member.role) === "lead";
                      return (
                        <div key={member.user_id} className="flex items-center gap-2">
                          <Avatar
                            userId={user.id}
                            name={user.name}
                            email={user.email}
                            avatarUrl={user.avatar_url}
                            size="xs"
                          />
                          <span className="text-sm text-slate-700">
                            {user.name ?? user.email ?? "Unknown user"}
                            {isOwnerMember ? (
                              <span className="ml-2 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-semibold">
                                Owner
                              </span>
                            ) : isLeadMember ? (
                              <span className="ml-2 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md font-semibold">
                                Lead
                              </span>
                            ) : user.job_role ? (
                              <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                                {user.job_role}
                              </span>
                            ) : (
                              <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                                Member
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {reviewerNames.length > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">Reviewers:</span>{" "}
                    <span className="font-medium text-slate-700">{reviewerNames.join(", ")}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* PIPELINE CONTROLS — Search + Sort + Filters */}
      <div className="space-y-3">
        {/* Search bar + filter toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={boardSearch}
              onChange={(e) => setBoardSearch(e.target.value)}
              placeholder="Search tasks by title or assignee..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none transition"
            />
            {boardSearch && (
              <button type="button" onClick={() => setBoardSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${showFilters ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {(boardSort !== "default" || boardTimeFilter !== "all" || boardMemberFilter !== "all") && (
              <span className="ml-1 h-2 w-2 rounded-full bg-blue-500" />
            )}
          </button>
        </div>

        {/* Filter/sort dropdowns — collapsible */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Sort By</label>
              <select value={boardSort} onChange={(e) => setBoardSort(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none">
                <option value="default">Default</option>
                <option value="alpha">Alphabetical</option>
                <option value="due">Due Date</option>
                <option value="start">Start Date</option>
                <option value="near_due">Near Due First</option>
                <option value="overdue">Overdue First</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Time</label>
              <select value={boardTimeFilter} onChange={(e) => setBoardTimeFilter(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none">
                <option value="all">All Time</option>
                <option value="today">Due Today</option>
                <option value="week">Due This Week</option>
                <option value="month">Due This Month</option>
                <option value="overdue">Overdue</option>
                <option value="near_due">Near Due (&lt;3d)</option>
                <option value="completed">Completed Recently</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Member</label>
              <select value={boardMemberFilter} onChange={(e) => setBoardMemberFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none">
                <option value="all">All Members</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user?.name ?? m.user?.email ?? "Unknown"}</option>
                ))}
              </select>
            </div>
            {(boardSort !== "default" || boardTimeFilter !== "all" || boardMemberFilter !== "all") && (
              <button type="button" onClick={() => { setBoardSort("default"); setBoardTimeFilter("all"); setBoardMemberFilter("all"); }} className="ml-auto text-xs text-blue-600 hover:text-blue-700 font-medium">
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* KANBAN BOARD */}
      <div className="overflow-x-auto">
        <div className="flex min-h-[500px] gap-6">
          {BOARD_COLUMNS.map((column) => {
            const now = boardNow;

            // 1) Apply search filter
            let filtered = columns[column.id].filter((t) => {
              if (!boardSearch.trim()) return true;
              const q = boardSearch.trim().toLowerCase();
              const titleMatch = t.title?.toLowerCase().includes(q);
              const nameMatch = t.assigneeName?.toLowerCase().includes(q) || t.assigneeEmail?.toLowerCase().includes(q);
              const multiMatch = t.assignees?.some((a) => a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q));
              return titleMatch || nameMatch || multiMatch;
            });

            // 2) Apply member filter
            if (boardMemberFilter !== "all") {
              filtered = filtered.filter((t) =>
                t.assigneeId === boardMemberFilter ||
                t.assignees?.some((a) => a.id === boardMemberFilter)
              );
            }

            // 3) Apply time filter
            if (boardTimeFilter !== "all") {
              filtered = filtered.filter((t) => {
                const due = getEffectiveTaskDueAt({ dueDate: t.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd });
                const daysRemaining = getSignedDaysRemaining({ dueDate: t.end_date, now, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd });
                const dueState = getTaskDueState({ dueDate: t.end_date, now, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd });
                switch (boardTimeFilter) {
                  case "today": return dueState.state === "due_today";
                  case "week": return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
                  case "month": return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 30;
                  case "overdue": return dueState.state === "overdue" && column.id !== "done";
                  case "near_due": {
                    if (!due || dueState.state === "overdue" || column.id === "done") return false;
                    const diff = (due.getTime() - now.getTime()) / 86400000;
                    return diff >= 0 && diff <= 3;
                  }
                  case "completed": return column.id === "done";
                  default: return true;
                }
              });
            }

            // 4) Apply sort
            const sorted = [...filtered].sort((a, b) => {
              switch (boardSort) {
                case "alpha": return (a.title ?? "").localeCompare(b.title ?? "");
                case "due": {
                  if (!a.end_date && !b.end_date) return 0;
                  if (!a.end_date) return 1;
                  if (!b.end_date) return -1;
                  return (getEffectiveTaskDueAt({ dueDate: a.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd })?.getTime() ?? Infinity)
                    - (getEffectiveTaskDueAt({ dueDate: b.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd })?.getTime() ?? Infinity);
                }
                case "start": {
                  if (!a.start_date && !b.start_date) return 0;
                  if (!a.start_date) return 1;
                  if (!b.start_date) return -1;
                  return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                }
                case "near_due": {
                  const aDue = Math.abs((getEffectiveTaskDueAt({ dueDate: a.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd })?.getTime() ?? Infinity) - now.getTime());
                  const bDue = Math.abs((getEffectiveTaskDueAt({ dueDate: b.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd })?.getTime() ?? Infinity) - now.getTime());
                  return aDue - bDue;
                }
                case "overdue": {
                  const aDueAt = getEffectiveTaskDueAt({ dueDate: a.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd });
                  const bDueAt = getEffectiveTaskDueAt({ dueDate: b.end_date, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd });
                  const aOver = getTaskDueState({ dueDate: a.end_date, now, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd }).state === "overdue" && aDueAt
                    ? now.getTime() - aDueAt.getTime()
                    : -Infinity;
                  const bOver = getTaskDueState({ dueDate: b.end_date, now, timeZone: projectTimeZone, workdayEnd: projectWorkdayEnd }).state === "overdue" && bDueAt
                    ? now.getTime() - bDueAt.getTime()
                    : -Infinity;
                  return bOver - aOver;
                }
                default: {
                  // Default: future start dates pushed to bottom
                  const aFuture = Boolean(a.start_date && a.start_date > projectToday);
                  const bFuture = Boolean(b.start_date && b.start_date > projectToday);
                  if (aFuture && !bFuture) return 1;
                  if (!aFuture && bFuture) return -1;
                  return 0;
                }
              }
            });

            return (
              <BoardColumn
                key={column.id}
                columnId={column.id}
                title={column.title}
                tasks={sorted.map((task) => ({
                  ...task,
                  reviewProgress: reviewProgressByTaskId[task.id],
                  canDrag: Boolean(task.canDrag && !pendingStatusTaskIds.has(task.id)),
                }))}
                isDragOver={dragOverColumn === column.id}
                onColumnDragOver={setDragOverColumn}
                onColumnDrop={onColumnDrop}
                onTaskDragStart={onTaskDragStart}
                onTaskDragEnd={onTaskDragEnd}
                onRemoveTask={onRemoveTask}
                onDeleteTask={onDeleteTask}
                onEditTask={handleEditTask}
                onOpenTaskDetails={handleOpenTaskDetails}
                onQuickAddTask={(columnId) => {
                  setNewTaskStatus(columnId);
                  setWorkingDatesDirty(false);
                  setCreateTaskError(null);
                  setShowCreateTaskModal(true);
                }}
                onExportTasks={(columnId) =>
                  handleExportTasks({
                    statusFilter: COLUMN_TO_STATUS[columnId],
                    statusLabel: COLUMN_EXPORT_LABEL[columnId],
                  })
                }
                onClaimTask={claimTask}
                onMarkReviewed={handleMarkTaskReviewed}
                onExtendWorkday={(taskId) => {
                  const task = sorted.find((item) => item.id === taskId);
                  const summary = manHours.taskSummaryById.get(taskId);
                  if (task && summary) setExtensionTask({ task, summary });
                }}
                canExtendWorkday={canExtendTaskWorkday}
                canClaim={!canManageProject}
                canDelete={true}
                canEdit={true}
                resetKey={projectId}
                taskSummaryById={manHours.taskSummaryById}
                projectTimeZone={projectTimeZone}
                normalWorkdayEnd={projectWorkdayEnd}
              />
            );
          })}
        </div>
      </div>

      <ProjectManHours
        asOf={manHours.data?.asOf}
        taskSummaries={manHours.taskSummaries}
        projectTotals={manHours.projectTotals}
        loading={manHours.loading}
        error={manHours.error}
        retry={manHours.retry}
      />

      {loading ? <div className="text-xs text-slate-500">Loading board tasks...</div> : null}
      {errorMessage ? <div className="text-xs text-red-600">{errorMessage}</div> : null}

      {renderTaskDetails()}

      {extensionTask ? (
        <WorkdayExtensionModal
          isOpen
          taskTitle={extensionTask.task.title}
          schedule={{
            taskId: extensionTask.task.id,
            projectId,
            scheduleState: extensionTask.summary.scheduleState,
            timeZone: projectTimeZone,
            normalWorkdayStart: projectTimeSettings.normalWorkdayStart,
            normalWorkdayEnd: projectTimeSettings.normalWorkdayEnd,
            effectiveFrom: null,
            dates: [],
            selectedDateCount: 0,
            todayLocalDate: projectToday,
            todayIsSelected: extensionTask.summary.todayIsSelected,
            nextSelectedDate: null,
            currentExtension: null,
            canManage: canExtendTaskWorkday(extensionTask.task),
            canCorrectHistory: false,
          } satisfies TaskWorkingSchedule}
          getAccessToken={getAccessToken}
          onClose={() => setExtensionTask(null)}
          onChanged={() => setManHoursRefreshKey((value) => value + 1)}
        />
      ) : null}


      {/* PROJECT OVERVIEW MODAL */}
      <Modal
        title="Project Overview"
        isOpen={showProjectOverviewModal}
        onClose={() => setShowProjectOverviewModal(false)}
        maxWidth="max-w-3xl"
      >
        {project ? (
          <div className="space-y-5 pb-4">
            <div>
              <h3 className="text-3xl font-bold tracking-[-0.02em] text-slate-900">{project.name || "Untitled Project"}</h3>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Description</p>
              <div className="mt-2 max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {project.description?.trim() || "No description provided."}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Start Date</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatProjectOverviewDate(project.start_date)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Due Date</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatProjectOverviewDate(project.end_date)}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* CREATE TASK MODAL */}
      <Modal title="Create Task" isOpen={showCreateTaskModal} onClose={() => { setShowCreateTaskModal(false); setPendingAttachments([]); setWorkingDatesDirty(false); setCreateTaskError(null); }}>
        <div className="space-y-4">
          <div>
            <label htmlFor="task-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Task Title
            </label>
            <input
              id="task-title"
              type="text"
              placeholder="e.g., Implement user authentication"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="task-description" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Description (Optional)
            </label>
            <textarea
              id="task-description"
              placeholder="Add a description..."
              className="mt-1 w-full min-h-[96px] max-h-[280px] resize-y overflow-y-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              rows={4}
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="task-assignee" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Assign To (Optional)
            </label>
            <select
              id="task-assignee"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Unassigned</option>
              {members.map((member) => {
                const user = member.user;
                if (!user) return null;
                return (
                  <option key={member.user_id} value={member.user_id}>
                    {user.name || user.email}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Creating in: {STATUS_LABEL[newTaskStatus]}
            </p>
          </div>

          <div className={newTaskAssignee ? "" : "opacity-50 pointer-events-none"}>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Additional Assignees (Optional)
            </label>
            {!newTaskAssignee && (
              <p className="text-xs text-gray-400 mt-1">
                Select a primary assignee first
              </p>
            )}
            {selectedAdditionalAssignees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedAdditionalAssignees.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {user.name ?? user.email ?? user.id}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAdditionalAssignees((prev) =>
                          prev.filter((u) => u.id !== user.id)
                        )
                      }
                      className="ml-0.5 text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {members
                .filter((member) => {
                  const user = member.user;
                  if (!user) return false;
                  // Exclude the primary assignee
                  if (user.id === newTaskAssignee) return false;
                  // Exclude already selected
                  if (selectedAdditionalAssignees.some((u) => u.id === user.id)) return false;
                  return true;
                })
                .map((member) => {
                  const user = member.user;
                  if (!user) return null;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() =>
                        setSelectedAdditionalAssignees((prev) => {
                          if (prev.find((u) => u.id === user.id)) return prev;
                          return [...prev, user as DbUser];
                        })
                      }
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                      disabled={isSubmitting}
                    >
                      + {user.name ?? user.email ?? "Unknown"}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Working Dates</p>
              <p className="mt-1 text-xs text-slate-500">
                Select the dates on which work is planned for this task. Times use {projectTimeZone}; normal working window: 9:00 AM–7:00 PM.
              </p>
            </div>
            <TaskWorkingDatesCalendar
              selectedDates={newTaskWorkingDates}
              onChange={(dates) => {
                setWorkingDatesDirty(true);
                setNewTaskWorkingDates(dates);
                setCreateTaskError(null);
              }}
              timeZone={projectTimeZone}
              disabled={isSubmitting}
              resetDates={[projectToday]}
              resetLabel="Reset selection"
            />
            <div className="mt-3 grid gap-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
              <p><span className="font-semibold">Selected working days:</span> {newTaskWorkingDates.length}</p>
              <p><span className="font-semibold">Planned start:</span> {formatWorkingDate(newTaskBounds.start, projectTimeZone)}</p>
              <p><span className="font-semibold">Planned end:</span> {formatWorkingDate(newTaskBounds.end, projectTimeZone)}</p>
              <p><span className="font-semibold">Working hours:</span> {formatWorkdayTime(projectTimeSettings.normalWorkdayStart)}–{formatWorkdayTime(projectTimeSettings.normalWorkdayEnd)}</p>
              <p className="sm:col-span-2"><span className="font-semibold">Timezone:</span> {projectTimeZone}</p>
            </div>
          </div>

          {/* Attachments */}
          <div className="mt-4">
            <CreateTaskAttachments
              pendingFiles={pendingAttachments}
              onFilesChange={setPendingAttachments}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setShowCreateTaskModal(false);
              setPendingAttachments([]);
              setWorkingDatesDirty(false);
              setCreateTaskError(null);
            }}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleCreateTask(newTaskTitle)}
            disabled={isSubmitting || !newTaskTitle.trim() || Boolean(workingDatesValidation)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Task"}
          </Button>
        </div>
        {createTaskError || workingDatesValidation ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">{createTaskError ?? workingDatesValidation}</p>
        ) : null}
      </Modal>

      {/* PROJECT TEAM MODAL */}
      <Modal
        title="Project Team"
        isOpen={showAddMemberModal}
        onClose={() => {
          setSelectedMemberIds([]);
          setReviewerSearch("");
          setSelectedReviewerId("");
          setShowAddMemberModal(false);
        }}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setProjectTeamTab("add")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                projectTeamTab === "add" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Add Members
            </button>
            <button
              type="button"
              onClick={() => setProjectTeamTab("manage")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                projectTeamTab === "manage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Manage Team
            </button>
            <button
              type="button"
              onClick={() => setProjectTeamTab("reviewer")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                projectTeamTab === "reviewer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Add Reviewer
            </button>
          </div>

          {projectTeamTab === "add" ? (
            <>
              <div>
                <label htmlFor="member-select" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Search Member by Name
                </label>
                <input
                  id="member-select"
                  type="text"
                  placeholder="Type member name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  value={newMemberSearch}
                  onChange={(e) => {
                    setNewMemberSearch(e.target.value);
                  }}
                  disabled={isSubmitting}
                  autoFocus
                />
                <p className="mt-1 text-xs text-slate-500">Select one or more users by name. Role is shown in suggestions.</p>
                {filteredUsers.length > 0 ? (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {filteredUsers.map((user) => {
                      const isSelected = selectedMemberIds.includes(user.id);

                      return (
                        <label
                          key={user.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-100"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedMemberIds((current) =>
                                current.includes(user.id)
                                  ? current.filter((id) => id !== user.id)
                                  : [...current, user.id],
                              );
                            }}
                            disabled={isSubmitting}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{user.name ?? user.email ?? "Unknown"}</span>
                          </span>
                          <span className="text-xs italic text-gray-400">{user.job_role ?? user.system_role ?? "user"}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {selectedMemberIds.length > 0 ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    {selectedMemberIds.length} selected
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedMemberIds([]);
                    setShowAddMemberModal(false);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleAddMembers()}
                  disabled={isSubmitting || selectedMemberIds.length === 0}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Add selected"}
                </Button>
              </div>
            </>
          ) : projectTeamTab === "manage" ? (
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={teamMemberSearch}
                  onChange={(e) => setTeamMemberSearch(e.target.value)}
                  placeholder="Search team members..."
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="relative min-h-[280px] overflow-visible rounded-xl border border-slate-200 bg-white">
                {filteredTeamMembers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No team members found.</div>
                ) : (
                  filteredTeamMembers.map((member, memberIndex) => {
                    const user = member.user;
                    if (!user) return null;
                    const shouldOpenTeamMenuUpward = filteredTeamMembers.length <= 2 || memberIndex >= filteredTeamMembers.length - 2;
                    const isOwnerMember = member.user_id === project?.owner_id;
                    const isLeadMember = normalizeRole(member.role) === "lead";
                    const canPromoteMember = canManageProjectMembers && !isOwnerMember && !isLeadMember;
                    const canRemoveMember = canRemoveProjectMembers && !isOwnerMember;
                    const hasMemberActions = canPromoteMember || canRemoveMember;
                    const isMemberBusy = managingMemberId === member.user_id;
                    const badgeLabel = isOwnerMember ? "Owner" : isLeadMember ? "Lead" : user.job_role ?? "Member";
                    const badgeClass = isOwnerMember
                      ? "bg-blue-50 text-blue-600"
                      : isLeadMember
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500";

                    return (
                      <div key={member.user_id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <Avatar
                          userId={user.id}
                          name={user.name}
                          email={user.email}
                          avatarUrl={user.avatar_url}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.name ?? user.email ?? "Unknown user"}</p>
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                              {badgeLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{user.email ?? user.job_role ?? user.system_role ?? "No details"}</p>
                        </div>
                        {hasMemberActions && (
                          <div className="relative" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={`Manage ${user.name ?? user.email ?? "team member"}`}
                              title={`Manage ${user.name ?? user.email ?? "team member"}`}
                              disabled={Boolean(managingMemberId)}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenTeamMemberMenuId((current) => (current === member.user_id ? null : member.user_id));
                              }}
                              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openTeamMemberMenuId === member.user_id && (
                              <div
                                className={`absolute right-0 z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
                                  shouldOpenTeamMenuUpward ? "bottom-full mb-2" : "top-full mt-2"
                                }`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {canPromoteMember && (
                                  <button
                                    type="button"
                                    disabled={isMemberBusy}
                                    onClick={() => void handlePromoteMember(member.user_id)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    <Crown size={14} />
                                    Promote to Lead
                                  </button>
                                )}
                                {canRemoveMember && (
                                  <button
                                    type="button"
                                    disabled={isMemberBusy}
                                    onClick={() => requestRemoveMember(member)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <UserMinus size={14} />
                                    Remove from Project
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label htmlFor="reviewer-select" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Search Reviewer by Name
                </label>
                <input
                  id="reviewer-select"
                  type="text"
                  placeholder="Type reviewer name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  value={reviewerSearch}
                  onChange={(event) => {
                    setReviewerSearch(event.target.value);
                    setSelectedReviewerId("");
                  }}
                  disabled={Boolean(managingReviewerId)}
                />
                <p className="mt-1 text-xs text-slate-500">Assign reviewers without changing their project member role.</p>
                {filteredReviewerMembers.length > 0 ? (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {filteredReviewerMembers.map((member) => {
                      const user = member.user;
                      if (!user) return null;
                      const isSelected = selectedReviewerId === user.id;

                      return (
                        <label
                          key={user.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-100"
                        >
                          <input
                            type="radio"
                            name="project-reviewer"
                            checked={isSelected}
                            onChange={() => setSelectedReviewerId(user.id)}
                            disabled={Boolean(managingReviewerId)}
                            className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <Avatar
                            userId={user.id}
                            name={user.name}
                            email={user.email}
                            avatarUrl={user.avatar_url}
                            size="xs"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{user.name ?? user.email ?? "Unknown"}</span>
                            <span className="block truncate text-xs text-slate-400">{user.email ?? user.job_role ?? "No details"}</span>
                          </span>
                          <span className="text-xs italic text-gray-400">
                            {member.role ?? "member"}{user.job_role ? ` - ${user.job_role}` : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : reviewerSearch.trim() ? (
                  <p className="mt-2 text-xs text-slate-400">No matching users available to add as reviewer.</p>
                ) : members.length > 0 && reviewers.length >= members.filter((member) => member.user).length ? (
                  <p className="mt-2 text-xs text-slate-400">All project members are already reviewers.</p>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={() => void handleAddReviewer()}
                    disabled={Boolean(managingReviewerId) || !selectedReviewerId}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {managingReviewerId === selectedReviewerId ? "Adding..." : "Add Reviewer"}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Current Reviewers</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {reviewers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">No reviewers assigned.</div>
                  ) : (
                    reviewers.map((reviewer) => {
                      const user = reviewer.user;
                      const isBusy = managingReviewerId === reviewer.user_id;

                      return (
                        <div key={reviewer.user_id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                          <Avatar
                            userId={user?.id}
                            name={user?.name}
                            email={user?.email}
                            avatarUrl={user?.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{user?.name ?? user?.email ?? "Unknown user"}</p>
                              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                Reviewer
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email ?? user?.job_role ?? "No details"}</p>
                          </div>
                          {canManageProjectMembers && (
                            <button
                              type="button"
                              aria-label={`Remove ${user?.name ?? user?.email ?? "reviewer"}`}
                              title="Remove reviewer"
                              disabled={Boolean(managingReviewerId)}
                              onClick={() => void handleRemoveReviewer(reviewer.user_id)}
                              className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal title="Remove Project Member" isOpen={Boolean(memberPendingRemoval)} onClose={() => setMemberPendingRemoval(null)}>
        <p className="text-sm leading-relaxed text-slate-600">
          Remove this member from the project? They will be unassigned from tasks in this project.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => setMemberPendingRemoval(null)}
            disabled={Boolean(managingMemberId)}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={confirmRemoveMember}
            disabled={Boolean(managingMemberId)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {managingMemberId ? "Removing..." : "Remove Member"}
          </Button>
        </div>
      </Modal>

      {/* EDIT TASK MODAL */}
      <Modal title="Edit Task" isOpen={Boolean(editingTask)} onClose={closeEditTask}>
        {editingTask && (
          <div className="space-y-4">
            <div>
              <label htmlFor="edit-task-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                Title
              </label>
              <input
                id="edit-task-title"
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                disabled={isSavingEdit2}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="edit-task-description" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                Description
              </label>
              <textarea
                id="edit-task-description"
                className="mt-1 w-full min-h-[96px] max-h-[280px] resize-y overflow-y-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                rows={4}
                placeholder="Add a description..."
                value={editingTask.description ?? ""}
                onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value || null })}
                disabled={isSavingEdit2}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Working Dates</p>
              {editScheduleLoading ? (
                <p className="mt-2 text-sm text-slate-500">Loading working dates…</p>
              ) : editScheduleState ? (
                <>
                  {editScheduleState === "legacy" ? (
                    <div className="my-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-semibold">Schedule not configured</p>
                      <p>Saving will configure this task’s working dates.</p>
                    </div>
                  ) : null}
                  <div className="mt-2 max-w-full overflow-x-hidden">
                    <TaskWorkingDatesCalendar
                      selectedDates={editWorkingDates}
                      onChange={(dates) => {
                        setEditWorkingDates(dates);
                        setEditScheduleError(null);
                      }}
                      timeZone={projectTimeZone}
                      disabled={isSavingEdit2}
                      resetDates={editOriginalWorkingDates}
                      resetLabel="Restore original dates"
                    />
                  </div>
                  <div className="mt-3 grid gap-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                    <p><span className="font-semibold">Selected working days:</span> {editWorkingDates.length}</p>
                    <p><span className="font-semibold">Planned start:</span> {formatWorkingDate(editTaskBounds.start, projectTimeZone)}</p>
                    <p><span className="font-semibold">Planned end:</span> {formatWorkingDate(editTaskBounds.end, projectTimeZone)}</p>
                    <p><span className="font-semibold">Working hours:</span> {formatWorkdayTime(projectTimeSettings.normalWorkdayStart)}–{formatWorkdayTime(projectTimeSettings.normalWorkdayEnd)}</p>
                    <p className="sm:col-span-2"><span className="font-semibold">Timezone:</span> {projectTimeZone}</p>
                  </div>
                </>
              ) : null}
              {editScheduleError ? (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3">
                  <p role="alert" className="text-sm font-medium text-red-700">{editScheduleError}</p>
                  {!editScheduleState ? (
                    <button type="button" onClick={() => void loadEditWorkingDates(editingTask)} className="text-xs font-semibold text-red-700 underline">Retry</button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={closeEditTask}
                disabled={isSavingEdit2}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleUpdateTask()}
                disabled={isSavingEdit2 || editScheduleLoading || !editScheduleState || !editingTask.title.trim() || editWorkingDates.length === 0}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {isSavingEdit2 ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
