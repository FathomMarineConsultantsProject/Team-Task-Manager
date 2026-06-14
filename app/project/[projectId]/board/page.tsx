"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Users, LayoutDashboard, ChevronDown, ChevronUp, Search, SlidersHorizontal, X, FileDown } from "lucide-react";
import { useExportTasks } from "@/lib/useExportTasks";
import BoardColumn from "@/components/board/BoardColumn";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Avatar from "@/components/ui/Avatar";
import ChatPanel from "@/components/ui/ChatPanel";
import MentionTextarea, { RenderMentionText, encodeMentionsForDatabase } from "@/components/ui/MentionTextarea";
import type { ColumnId, Task } from "@/components/board/types";
import { useAppData } from "@/components/providers/AppDataProvider";
import { createEmptyColumns } from "@/lib/data";
import CreateTaskAttachments from "@/components/tasks/CreateTaskAttachments";
import type { PendingAttachment } from "@/components/tasks/CreateTaskAttachments";
import TaskAttachments from "@/components/tasks/TaskAttachments";

type DbTask = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
};

type DbUser = {
  id: string;
  name: string | null;
  email: string | null;
  job_role: string | null;
  avatar_url: string | null;
};

type DbProject = {
  id: string;
  name: string | null;
  description: string | null;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at?: string | null;
  owner?: {
    id: string | null;
    email: string | null;
  }[] | null;
  project_members?: {
    user_id: string | null;
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
    avatar_url: string | null;
  } | null;
};

type TaskDetailsModalState = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeName: string;
  assigneeId: string | null;
  createdAt: string | null;
  startDate: string | null;
  endDate: string | null;
  assignees?: { id: string; name: string | null; email: string | null }[];
  createdById?: string | null;
};

type TaskLogRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string | null;
};

type TaskLogEntry = TaskLogRow & {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    job_role: string | null;
  } | null;
};

type TaskUpdateRow = {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
  reply_to: string | null;
};

type TaskUpdateEntry = TaskUpdateRow & {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    job_role: string | null;
    avatar_url: string | null;
  } | null;
  replies?: TaskUpdateEntry[];
};

type TaskChatMessage = {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

const BOARD_COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: "todo", title: "TO DO" },
  { id: "inProgress", title: "IN PROGRESS" },
  { id: "review", title: "IN REVIEW" },
  { id: "done", title: "DONE" },
];

const STATUS_TO_COLUMN: Record<string, ColumnId> = {
  todo: "todo",
  in_progress: "inProgress",
  in_review: "review",
  done: "done",
};

const COLUMN_TO_STATUS: Record<ColumnId, "todo" | "in_progress" | "in_review" | "done"> = {
  todo: "todo",
  inProgress: "in_progress",
  review: "in_review",
  done: "done",
};

const COLUMN_ACCENT: Record<ColumnId, string> = {
  todo: "bg-orange-500",
  inProgress: "bg-sky-500",
  review: "bg-amber-500",
  done: "bg-emerald-600",
};

const STATUS_LABEL: Record<ColumnId, string> = {
  todo: "TODO",
  inProgress: "IN PROGRESS",
  review: "IN REVIEW",
  done: "DONE",
};

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

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatStatusValue = (value: string | null | undefined) => {
  if (!value) {
    return "UNKNOWN";
  }

  return value.replace(/_/g, " ").toUpperCase();
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
  
  // Project state (new)
  const [project, setProject] = useState<DbProject | null>(null);
  const [members, setMembers] = useState<DbProjectMember[]>([]);
  const [projectLoading, setProjectLoading] = useState(true);
  
  // Modal state (new)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<ColumnId>("todo");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newMemberSearch, setNewMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<DbUser | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<DbUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskUpdateCounts, setTaskUpdateCounts] = useState<Record<string, number>>({});
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<TaskDetailsModalState | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLogEntry[]>([]);
  const [taskLogsLoading, setTaskLogsLoading] = useState(false);
  const [taskUpdates, setTaskUpdates] = useState<TaskUpdateEntry[]>([]);
  const [isUpdateComposerOpen, setIsUpdateComposerOpen] = useState(false);
  const [updateContent, setUpdateContent] = useState("");
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [selectedAdditionalAssignees, setSelectedAdditionalAssignees] = useState<DbUser[]>([]);
  const [isAddingTaskMember, setIsAddingTaskMember] = useState(false);
  const [showTaskMemberDropdown, setShowTaskMemberDropdown] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSavingEdit2, setIsSavingEdit2] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSavingReply, setIsSavingReply] = useState(false);
  const [taskChatMessages, setTaskChatMessages] = useState<TaskChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
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

  // Excel export hook
  const { isExporting, handleExportTasks } = useExportTasks({
    supabase,
    projectId,
    projectName: project?.name ?? null,
    members: members.map((m) => ({ user_id: m.user_id, user: m.user })),
  });

  const isOwner = Boolean(project?.owner_id && profile?.id && project.owner_id === profile.id);
  const isSuperAdmin = (profile?.system_role ?? "").toLowerCase() === "super_admin";
  const isAdmin = (profile?.system_role ?? profile?.role ?? "").toLowerCase() === "admin";
  const canManageProject = isOwner || isAdmin;
  const isProjectMember = Boolean(profile?.id && members.some((member) => member.user_id === profile.id));
  const isProjectOwnerMember = Boolean(
    profile?.id &&
      members.some((member) => member.user_id === profile.id && (member.role ?? "").toLowerCase() === "owner"),
  );
  const canViewTaskUpdates = isProjectMember || canManageProject;

  useEffect(() => {
    setTimerNow(Date.now());
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  const canMoveTask = useCallback(
    (assignedTo: string | null, assignees?: { id: string }[], startDate?: string | null) => {
      if (!profile?.id) return false;

      // Admin / owner always allowed
      if (canManageProject) return true;

      const isAssignee = assignedTo === profile.id;
      const isMultiAssignee = assignees?.some(u => u.id === profile.id) ?? false;

      if (!isAssignee && !isMultiAssignee) return false;

      // Date lock: future tasks cannot be moved
      if (startDate) {
        const today = new Date();
        const taskStart = new Date(startDate);
        today.setHours(0, 0, 0, 0);
        taskStart.setHours(0, 0, 0, 0);
        if (taskStart > today) return false;
      }

      return true;
    },
    [profile?.id, canManageProject],
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

  const loadTaskDetailsData = useCallback(async () => {
    console.log("[DEBUG loadTaskDetailsData] called", {
      taskId: selectedTaskDetails?.id,
      projectId,
      canViewTaskUpdates,
    });
    if (!selectedTaskDetails?.id || !projectId || !canViewTaskUpdates) {
      console.log("[DEBUG loadTaskDetailsData] EARLY RETURN - missing:", {
        hasTaskId: !!selectedTaskDetails?.id,
        hasProjectId: !!projectId,
        canViewTaskUpdates,
      });
      setTaskLogs([]);
      setTaskUpdates([]);
      return;
    }

    try {
      setTaskLogsLoading(true);

      const [logsResponse, updatesResponse] = await Promise.all([
        supabase
          .from("task_logs")
          .select("id, action, from_status, to_status, created_at, user_id")
          .eq("task_id", selectedTaskDetails.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("task_updates")
          .select("id, task_id, project_id, user_id, content, created_at, reply_to")
          .eq("task_id", selectedTaskDetails.id)
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);
      console.log("[DEBUG loadTaskDetailsData] query results:", {
        logsError: logsResponse.error,
        logsCount: logsResponse.data?.length ?? 0,
        updatesError: updatesResponse.error,
        updatesCount: updatesResponse.data?.length ?? 0,
        updatesData: updatesResponse.data,
      });

      if (logsResponse.error) {
        setTaskLogs([]);
      }

      if (updatesResponse.error) {
        setTaskUpdates([]);
      }

      const logsRows = (logsResponse.data as TaskLogRow[] | null | undefined) ?? [];
      const updateRows = (updatesResponse.data as TaskUpdateRow[] | null | undefined) ?? [];

      const userIds = Array.from(
        new Set(
          [...logsRows.map((row) => row.user_id), ...updateRows.map((row) => row.user_id)].filter(Boolean),
        ),
      ) as string[];

      let usersById: Record<string, DbUser> = {};

      if (userIds.length > 0) {
        try {
          const { data: usersData, error: usersError } = await supabase
            .from("users")
            .select("id, name, email, job_role, avatar_url")
            .in("id", userIds);

          if (!usersError) {
            usersById = ((usersData as DbUser[] | null | undefined) ?? []).reduce<Record<string, DbUser>>((acc, user) => {
              acc[user.id] = user;
              return acc;
            }, {});
          }
        } catch {
          usersById = {};
        }
      }

      setTaskLogs(
        logsRows.map((row) => ({
          ...row,
          user: (row.user_id && usersById[row.user_id]) || null,
        })),
      );

      setTaskUpdates(
        (updateRows ?? []).map((row) => ({
          ...row,
          content: row.content?.trim() ?? "",
          user: usersById[row.user_id] ?? null,
        })),
      );
    } catch {
      setTaskLogs([]);
      setTaskUpdates([]);
    } finally {
      setTaskLogsLoading(false);
    }
  }, [canViewTaskUpdates, projectId, selectedTaskDetails?.id, supabase]);

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

      setSelectedTaskDetails({
        id: task.id,
        title: task.title,
        description: descriptionValue,
        status: task.statusLabel ?? STATUS_LABEL[column],
        assigneeName: task.assigneeName ?? task.assigneeEmail ?? "Unassigned",
        assigneeId: task.assigneeId ?? null,
        createdAt,
        startDate: startDateValue,
        endDate: endDateValue,
        assignees: task.assignees ?? [],
        createdById: createdByIdValue,
      });
      setIsUpdateComposerOpen(false);
      setUpdateContent("");
      setEditingUpdateId(null);
      setEditingUpdateContent("");
    },
    [columns, projectId, supabase],
  );

  const closeTaskDetails = useCallback(() => {
    setSelectedTaskDetails(null);
    setTaskLogs([]);
    setTaskUpdates([]);
    setIsUpdateComposerOpen(false);
    setUpdateContent("");
    setEditingUpdateId(null);
    setEditingUpdateContent("");
    setShowTaskMemberDropdown(false);
  }, []);

  const addMemberToTask = useCallback(
    async (userId: string) => {
      if (!selectedTaskDetails?.id || !projectId) return;

      // Prevent duplicates
      if (selectedTaskDetails.assignees?.some((u) => u.id === userId)) return;

      setIsAddingTaskMember(true);
      try {
        const { error } = await supabase.from("task_assignees").insert({
          task_id: selectedTaskDetails.id,
          user_id: userId,
        });

        if (error) {
          console.error("Failed to add member to task", error);
          return;
        }

        // Find user info from members list
        const memberUser = members.find((m) => m.user_id === userId)?.user;
        const newAssignee = {
          id: userId,
          name: memberUser?.name ?? null,
          email: memberUser?.email ?? null,
        };

        // Update selectedTaskDetails
        setSelectedTaskDetails((prev) =>
          prev
            ? {
                ...prev,
                assignees: [...(prev.assignees ?? []), newAssignee],
              }
            : prev,
        );

        // Update task in columns state
        setColumns((prev) => {
          const next = { ...prev };
          BOARD_COLUMNS.forEach((col) => {
            next[col.id] = next[col.id].map((t) =>
              t.id === selectedTaskDetails.id
                ? { ...t, assignees: [...(t.assignees ?? []), newAssignee] }
                : t,
            );
          });
          return next;
        });

        setShowTaskMemberDropdown(false);
      } catch (err) {
        console.error("Failed to add member to task", err);
      } finally {
        setIsAddingTaskMember(false);
      }
    },
    [selectedTaskDetails, projectId, supabase, members],
  );

  // Live Chat is project-wide collaboration: any project member can participate.
  // Task edit/move/delete permissions remain unchanged (assignee/owner/admin only).
  const canAddTaskUpdate = useMemo(() => {
    if (!selectedTaskDetails || !profile?.id) {
      return false;
    }

    return isProjectMember || isProjectOwnerMember || isSuperAdmin;
  }, [isProjectMember, isProjectOwnerMember, isSuperAdmin, profile?.id, selectedTaskDetails]);

  const canManageAssignees = useMemo(() => {
    if (!profile?.id) return false;

    const isPrimaryAssignee = selectedTaskDetails?.assigneeId === profile.id;

    let isMultiAssignee = false;
    BOARD_COLUMNS.forEach((col) => {
      const t = columns[col.id].find((task) => task.id === selectedTaskDetails?.id);
      if (t?.assignees?.some(u => u.id === profile.id)) {
        isMultiAssignee = true;
      }
    });

    return (
      isSuperAdmin ||
      isProjectOwnerMember ||
      canManageProject ||
      isPrimaryAssignee ||
      isMultiAssignee
    );
  }, [profile?.id, selectedTaskDetails, columns, isSuperAdmin, isProjectOwnerMember, canManageProject]);

  // ---- Attachment permissions for Task Details ----
  const canUploadAttachment = useMemo(() => {
    if (!selectedTaskDetails || !profile?.id) return false;
    // Project Owner, Project Lead, Task Creator, Task Assignee
    if (isOwner || canManageProject || isSuperAdmin) return true;
    if (selectedTaskDetails.createdById === profile.id) return true;
    if (selectedTaskDetails.assigneeId === profile.id) return true;
    if (selectedTaskDetails.assignees?.some((a) => a.id === profile.id)) return true;
    return false;
  }, [selectedTaskDetails, profile?.id, isOwner, canManageProject, isSuperAdmin]);

  const canDeleteAllAttachments = useMemo(() => {
    if (!profile?.id) return false;
    // Project Owner, Project Lead
    return isOwner || canManageProject || isSuperAdmin;
  }, [profile?.id, isOwner, canManageProject, isSuperAdmin]);


  const createTaskUpdate = useCallback(async () => {
    const trimmed = updateContent.trim();
    if (!selectedTaskDetails || !profile?.id || !projectId) {
      return;
    }

    if (trimmed.length < 5) {
      return;
    }

    try {
      if (!canAddTaskUpdate) {
        throw new Error("Not allowed");
      }

      setIsSavingUpdate(true);
      const { error } = await supabase.from("task_updates").insert({
        task_id: selectedTaskDetails.id,
        project_id: projectId,
        user_id: profile.id,
        content: encodeMentionsForDatabase(trimmed, members.map(m => m.user).filter((u): u is NonNullable<typeof u> => u !== null)),
      });

      if (error) {
        return;
      }

      setUpdateContent("");
      setIsUpdateComposerOpen(false);
      await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
    } catch {
      // fail silently
    } finally {
      setIsSavingUpdate(false);
    }
  }, [canAddTaskUpdate, loadTaskDetailsData, loadTaskUpdateCounts, profile?.id, projectId, selectedTaskDetails, supabase, updateContent]);

  const saveTaskUpdateEdit = useCallback(async () => {
    const trimmed = editingUpdateContent.trim();
    if (!editingUpdateId || trimmed.length === 0) {
      return;
    }

    try {
      if (!canAddTaskUpdate) {
        throw new Error("Not allowed");
      }

      setIsSavingEdit(true);
      const { error } = await supabase
        .from("task_updates")
        .update({ content: encodeMentionsForDatabase(trimmed, members.map(m => m.user).filter((u): u is NonNullable<typeof u> => u !== null)) })
        .eq("id", editingUpdateId);

      if (error) {
        return;
      }

      setEditingUpdateId(null);
      setEditingUpdateContent("");
      await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
    } catch {
      // fail silently
    } finally {
      setIsSavingEdit(false);
    }
  }, [canAddTaskUpdate, editingUpdateContent, editingUpdateId, loadTaskDetailsData, loadTaskUpdateCounts, supabase, members]);

  const deleteTaskUpdate = useCallback(
    async (updateId: string) => {
      if (!window.confirm("Delete this update?")) {
        return;
      }

      try {
        if (!canAddTaskUpdate) {
          throw new Error("Not allowed");
        }

        const deleteQuery = supabase.from("task_updates").delete().eq("id", updateId).eq("project_id", projectId);
        const { error } = isProjectOwnerMember || isSuperAdmin ? await deleteQuery : await deleteQuery.eq("user_id", profile?.id ?? "");

        if (error) {
          return;
        }

        await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
      } catch {
        // fail silently
      }
    },
    [canAddTaskUpdate, isProjectOwnerMember, isSuperAdmin, loadTaskDetailsData, loadTaskUpdateCounts, profile?.id, projectId, supabase],
  );

  const describeLog = useCallback((log: TaskLogEntry) => {
    if (log.action === "moved") {
      return `Moved from ${formatStatusValue(log.from_status)} -> ${formatStatusValue(log.to_status)}`;
    }

    if (log.action === "assigned") {
      return "Assigned task";
    }

    if (log.action === "created") {
      return "Task created";
    }

    return "Task updated";
  }, []);

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
              created_at,
              owner:users!projects_owner_id_fkey (
                id,
                email
              ),
              project_members(
                user_id,
                users (
                  id,
                  name,
                  job_role,
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
              user:users(id, name, email, job_role, avatar_url)
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
      if (!title.trim() || !projectId) {
        return;
      }

      setIsSubmitting(true);

      // Build strict payload
      const payload = {
        title: title.trim(),
        description: newTaskDescription.trim() || null,
        project_id: projectId,
        status: COLUMN_TO_STATUS[newTaskStatus],
        assigned_to: newTaskAssignee || null,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: profile?.id ?? null,
      };
      console.log("Creating task with payload:", payload);
      console.log("projectId:", projectId);
      console.log("currentUserId:", profile?.id);

      try {
        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData.user?.id;
        if (!currentUserId) {
          console.error("Task creation failed: missing authenticated user");
          alert("Please sign in again to create tasks.");
          return;
        }

        const { data, error } = await supabase
          .from("tasks")
          .insert([{ ...payload, created_by: currentUserId }])
          .select();

        if (error) {
          console.error("Task insert error - FULL ERROR:", error);
          return;
        }

        console.log("Task created successfully:", data);
        setNewTaskTitle("");
        setNewTaskAssignee("");
        setNewTaskStatus("todo");
        setStartDate("");
        setEndDate("");
        setNewTaskDescription("");
        setShowCreateTaskModal(false);

        // Immediately append new task to local state
        if (data && data.length > 0) {
          const newTask = data[0];
          await insertTaskLog({
            taskId: newTask.id,
            action: "created",
            fromStatus: null,
            toStatus: newTask.status,
            userId: currentUserId,
          });

          if (newTask.assigned_to) {
            await insertTaskLog({
              taskId: newTask.id,
              action: "assigned",
              fromStatus: null,
              toStatus: null,
              userId: currentUserId,
            });
          }

          // Insert additional assignees into task_assignees
          const additionalAssigneesToInsert = selectedAdditionalAssignees.filter(
            (u) => u.id !== newTask.assigned_to
          );
          if (newTask.assigned_to && additionalAssigneesToInsert.length > 0) {
            try {
              await supabase.from("task_assignees").insert(
                additionalAssigneesToInsert.map((user) => ({
                  task_id: newTask.id,
                  user_id: user.id,
                }))
              );
            } catch {
              // task_assignees table may not exist yet — fail silently
            }
          }
          setSelectedAdditionalAssignees([]);

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
          setPendingAttachments([]);
        }
      } catch (error) {
        console.error("Failed to create task:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        alert(`Failed to create task: ${errorMsg}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, supabase, newTaskAssignee, newTaskStatus, startDate, endDate, profile?.id, members, canMoveTask, insertTaskLog, selectedAdditionalAssignees, pendingAttachments, newTaskDescription],
  );

  const handleAddMember = useCallback(
    async (userId: string) => {
      if (!userId || !projectId) {
        return;
      }

      // SECURITY: Only owner can add members
      if (!canManageProject) {
        alert("Only the project owner or admin can add members.");
        console.warn("Unauthorized: Non-owner/non-admin attempted to add member");
        return;
      }

      setIsSubmitting(true);

      try {
        console.log("Adding user to project:", { userId, projectId });

        // Add to project_members
        const { error: memberError } = await supabase.from("project_members").insert({
          project_id: projectId,
          user_id: userId,
          role: "member",
        });

        if (memberError) {
          console.error("Member insert error:", memberError);
          throw memberError;
        }

        console.log("Member added successfully");
        setNewMemberSearch("");
        setSelectedMember(null);
        setShowAddMemberModal(false);

        // Reload members
        const { data: updatedMembers } = await supabase
          .from("project_members")
          .select(
            `
              user_id,
              user:users(id, name, email, job_role, avatar_url)
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
    [projectId, supabase, canManageProject],
  );

  useEffect(() => {
    if (!showAddMemberModal) {
      return;
    }

    let isMounted = true;

    const loadDirectoryUsers = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, job_role, avatar_url")
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
          .select("id, title, description, status, assigned_to, start_date, end_date")
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
            .select("id, name, email, job_role, avatar_url")
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
    if (!selectedTaskDetails?.id) {
      return;
    }

    void loadTaskDetailsData();
  }, [loadTaskDetailsData, selectedTaskDetails?.id]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    setColumns((current) => applyTaskUpdateCounts(current));
  }, [applyTaskUpdateCounts, projectId, taskUpdateCounts]);

  const onTaskDragStart = useCallback(
    (taskId: string, from: ColumnId) => {
      const task = columns[from].find((item) => item.id === taskId);
      const canMove = canMoveTask(task?.assigneeId ?? null, task?.assignees, task?.start_date);

      if (!canMove) {
        console.warn("Unauthorized action");
        return;
      }

      setActiveDrag({ taskId, from });
    },
    [columns, canMoveTask],
  );

  const onTaskDragEnd = useCallback(() => {
    setActiveDrag(null);
    setDragOverColumn(null);
  }, []);

  const updateTaskStatus = useCallback(
    async (taskId: string, destination: ColumnId, source: ColumnId) => {
      const sourceTask = columns[source].find((task) => task.id === taskId);
      const canMove = canMoveTask(sourceTask?.assigneeId ?? null, sourceTask?.assignees, sourceTask?.start_date);

      if (!canMove) {
        console.warn("Unauthorized action");
        return;
      }

      const { error } = await supabase
        .from("tasks")
        .update({ status: COLUMN_TO_STATUS[destination], updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("project_id", projectId);

      if (error) {
        setColumns((current) => {
          const destinationTasks = current[destination];
          const movedTask = destinationTasks.find((task) => task.id === taskId);
          if (!movedTask) {
            return current;
          }

          return {
            ...current,
            [destination]: destinationTasks.filter((task) => task.id !== taskId),
            [source]: [
              ...current[source],
              {
                ...movedTask,
                statusLabel: STATUS_LABEL[source],
                accent: COLUMN_ACCENT[source],
              },
            ],
          };
        });
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData.user?.id;
        if (!currentUserId) {
          console.error("Task log insert skipped: missing authenticated user");
          return;
        }

        await insertTaskLog({
          taskId,
          action: "moved",
          fromStatus: COLUMN_TO_STATUS[source],
          toStatus: COLUMN_TO_STATUS[destination],
          userId: currentUserId,
        });
      }
    },
    [projectId, supabase, columns, canMoveTask, insertTaskLog],
  );

  const onColumnDrop = useCallback(
    (destination: ColumnId) => {
      if (!activeDrag) {
        return;
      }

      const { taskId, from } = activeDrag;

      if (from === destination) {
        setActiveDrag(null);
        setDragOverColumn(null);
        return;
      }

      setColumns((current) => {
        const sourceTasks = current[from];
        const movedTask = sourceTasks.find((task) => task.id === taskId);
        if (!movedTask) {
          return current;
        }

        const canMove = canMoveTask(movedTask.assigneeId ?? null, movedTask.assignees, movedTask.start_date);
        if (!canMove) {
          console.warn("Unauthorized action");
          return current;
        }

        return {
          ...current,
          [from]: sourceTasks.filter((task) => task.id !== taskId),
          [destination]: [
            {
              ...movedTask,
              statusLabel: STATUS_LABEL[destination],
              accent: COLUMN_ACCENT[destination],
            },
            ...current[destination],
          ],
        };
      });

      void updateTaskStatus(taskId, destination, from);
      setActiveDrag(null);
      setDragOverColumn(null);
    },
    [activeDrag, updateTaskStatus],
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

      // Fetch description from DB
      let description: string | null = null;
      try {
        const { data } = await supabase
          .from("tasks")
          .select("description")
          .eq("id", taskId)
          .eq("project_id", projectId)
          .single();
        description = (data as any)?.description ?? null;
      } catch { /* silent */ }

      setEditingTask({ ...task, description });
    },
    [findTaskFromColumns, canManageProject, profile?.id, supabase, projectId],
  );

  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return;

    setIsSavingEdit2(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: editingTask.title,
          description: editingTask.description ?? null,
          start_date: editingTask.start_date ?? null,
          end_date: editingTask.end_date ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTask.id)
        .eq("project_id", projectId);

      if (!error) {
        setColumns((prev) => {
          const updated = { ...prev };
          BOARD_COLUMNS.forEach((col) => {
            updated[col.id] = updated[col.id].map((t) => {
              if (t.id !== editingTask.id) return t;
              return {
                ...t,
                title: editingTask.title,
                description: editingTask.description,
                start_date: editingTask.start_date,
                end_date: editingTask.end_date,
                canDrag: canMoveTask(t.assigneeId ?? null, t.assignees, editingTask.start_date),
              };
            });
          });
          return updated;
        });
        setEditingTask(null);
      } else {
        console.error("Task update error:", error);
        alert("Failed to update task.");
      }
    } catch (err) {
      console.error("Failed to update task", err);
      alert("Failed to update task.");
    } finally {
      setIsSavingEdit2(false);
    }
  }, [editingTask, projectId, supabase, canMoveTask]);

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

      const { error: updateError } = await supabase
        .from("tasks")
        .update({ assigned_to: profile.id, updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("project_id", projectId);

      if (updateError) {
        console.error("Failed to claim task", updateError);
        alert("Failed to claim task.");
        return;
      }

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
        .select("id, title, description, status, assigned_to, start_date, end_date")
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
          .select("id, name, email, job_role, avatar_url")
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
            statusLabel: STATUS_LABEL[columnId],
            canDrag: canMoveTask(row.assigned_to, assignees, row.start_date),
            updatesCount: updatesMap[row.id] ?? 0,
            assignees,
          },
        ];
      });

      setColumns(groupedColumns);
    },
    [profile?.id, supabase, projectId, canMoveTask, columns, insertTaskLog],
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
          .select("id, title, description, status, assigned_to, start_date, end_date")
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
            .select("id, name, email, job_role, avatar_url")
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
              <div className="flex-1">
                <h1 className="text-4xl font-bold tracking-[-0.02em] text-slate-900">{project.name || "Untitled Project"}</h1>
                {project.description ? (
                  <p className="mt-1 text-sm text-slate-600">{project.description}</p>
                ) : null}
                {(project.start_date || project.end_date) && (
                  <p className="text-sm text-slate-500 mt-1">
                    {project.start_date && `Start: ${new Date(project.start_date).toLocaleDateString()}`}
                    {" "}
                    {project.end_date && `• Due: ${new Date(project.end_date).toLocaleDateString()}`}
                  </p>
                )}
              </div>
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
                  {canManageProject && (
                    <Button
                      onClick={() => setShowAddMemberModal(true)}
                      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Users size={16} />
                      Add Member
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
                                Lead
                              </span>
                            ) : user.job_role ? (
                              <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                                {user.job_role}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
            const now = new Date();
            const today = new Date(); today.setHours(23, 59, 59, 999);
            const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
            const monthEnd = new Date(now); monthEnd.setMonth(monthEnd.getMonth() + 1);

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
                const due = t.end_date ? new Date(t.end_date) : null;
                switch (boardTimeFilter) {
                  case "today": return due && due <= today && due >= new Date(now.toDateString());
                  case "week": return due && due <= weekEnd && due >= now;
                  case "month": return due && due <= monthEnd && due >= now;
                  case "overdue": return due && due < now && column.id !== "done";
                  case "near_due": {
                    if (!due || column.id === "done") return false;
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
                  return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
                }
                case "start": {
                  if (!a.start_date && !b.start_date) return 0;
                  if (!a.start_date) return 1;
                  if (!b.start_date) return -1;
                  return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
                }
                case "near_due": {
                  const aDue = a.end_date ? Math.abs(new Date(a.end_date).getTime() - now.getTime()) : Infinity;
                  const bDue = b.end_date ? Math.abs(new Date(b.end_date).getTime() - now.getTime()) : Infinity;
                  return aDue - bDue;
                }
                case "overdue": {
                  const aOver = a.end_date && new Date(a.end_date) < now ? now.getTime() - new Date(a.end_date).getTime() : -Infinity;
                  const bOver = b.end_date && new Date(b.end_date) < now ? now.getTime() - new Date(b.end_date).getTime() : -Infinity;
                  return bOver - aOver;
                }
                default: {
                  // Default: future start dates pushed to bottom
                  const aFuture = a.start_date && new Date(a.start_date) > now;
                  const bFuture = b.start_date && new Date(b.start_date) > now;
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
                tasks={sorted}
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
                  setShowCreateTaskModal(true);
                }}
                onClaimTask={claimTask}
                canClaim={!canManageProject}
                canDelete={true}
                canEdit={true}
              />
            );
          })}
        </div>
      </div>

      {loading ? <div className="text-xs text-slate-500">Loading board tasks...</div> : null}
      {errorMessage ? <div className="text-xs text-red-600">{errorMessage}</div> : null}

      <Modal title="Task Details" isOpen={Boolean(selectedTaskDetails)} onClose={closeTaskDetails}>
        {selectedTaskDetails ? (
          <div className="space-y-5 text-sm text-slate-700">
            <div className="space-y-2">
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight text-slate-900 break-words line-clamp-2">{selectedTaskDetails.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-500">{selectedTaskDetails.status}</p>
              <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-1">Description</p>
                {selectedTaskDetails.description ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedTaskDetails.description}</p>
                ) : (
                  <p className="text-sm text-slate-400 italic">No description provided.</p>
                )}
              </div>
              </div>
              {/* Multi-assignee display */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-1">Assigned To</p>
                {(() => {
                  const assignees = selectedTaskDetails.assignees ?? [];
                  if (assignees.length === 0) {
                    return <p className="text-sm text-slate-600">Unassigned</p>;
                  }
                  const names = assignees.map((u) => u.name || u.email || "Unknown");
                  const display =
                    names.length <= 2
                      ? names.join(", ")
                      : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
                  return (
                    <p
                      className="text-sm text-slate-600"
                      title={names.join(", ")}
                    >
                      {display}
                    </p>
                  );
                })()}

                {/* Add member to task */}
                {canManageAssignees && (
                  <div className="mt-2">
                    {showTaskMemberDropdown ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="max-h-[160px] overflow-y-auto space-y-1">
                          {(() => {
                            const currentAssigneeIds = new Set(
                              (selectedTaskDetails.assignees ?? []).map((u) => u.id),
                            );
                            const available = members.filter(
                              (m) => m.user && !currentAssigneeIds.has(m.user_id),
                            );
                            if (available.length === 0) {
                              return (
                                <p className="px-2 py-1.5 text-xs text-slate-400">
                                  All members already assigned
                                </p>
                              );
                            }
                            return available.map((member) => {
                              const user = member.user;
                              if (!user) return null;
                              return (
                                <button
                                  key={user.id}
                                  type="button"
                                  disabled={isAddingTaskMember}
                                  onClick={() => void addMemberToTask(user.id)}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <Avatar
                                    userId={user.id}
                                    name={user.name}
                                    email={user.email}
                                    avatarUrl={user.avatar_url}
                                    size="xs"
                                  />
                                  <span>{user.name ?? user.email ?? "Unknown"}</span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTaskMemberDropdown(false)}
                          className="mt-1 w-full rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTaskMemberDropdown(true)}
                        className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                      >
                        + Add Member
                      </button>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">Created: {formatDateTime(selectedTaskDetails.createdAt)}</p>
              {selectedTaskDetails.startDate && (
                <div>
                  <p className="text-xs text-gray-500">Start Date</p>
                  <p className="text-sm">{selectedTaskDetails.startDate}</p>
                </div>
              )}
              {selectedTaskDetails.endDate && (
                <div>
                  <p className="text-xs text-gray-500">Due Date</p>
                  <p className="text-sm">{selectedTaskDetails.endDate}</p>
                </div>
              )}
              {!canAddTaskUpdate ? (
                <p className="text-xs text-slate-500">Only project members can participate in task discussions.</p>
              ) : null}
            </div>

            {/* Attachments */}
            <TaskAttachments
              supabase={supabase}
              taskId={selectedTaskDetails.id}
              profileId={profile?.id ?? null}
              canUpload={canUploadAttachment}
              canDeleteAll={canDeleteAllAttachments}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Activity Timeline</p>
              <div className="mt-3 max-h-[200px] overflow-y-auto pr-2 space-y-0">
                {taskLogsLoading ? (
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
                        {log.user?.name || log.user?.email || "Unknown"} • {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Live Chat Panel — renders as independent side panel */}
      <ChatPanel
        isOpen={Boolean(selectedTaskDetails)}
        onClose={closeTaskDetails}
        taskTitle={selectedTaskDetails?.title ?? ""}
        taskUpdates={taskUpdates}
        members={members.map(m => ({ user_id: m.user_id, user: m.user ? { id: m.user?.id ?? m.user_id, name: m.user?.name ?? null, email: m.user?.email ?? null, avatar_url: m.user?.avatar_url ?? null } : null }))}
        profileId={profile?.id ?? null}
        canAddUpdate={canAddTaskUpdate}
        canViewUpdates={canViewTaskUpdates}
        isProjectOwnerMember={isProjectOwnerMember}
        isSuperAdmin={isSuperAdmin}
        onCreateUpdate={async (content) => {
          if (!selectedTaskDetails || !profile?.id || !projectId) return;
          await supabase.from("task_updates").insert({
            task_id: selectedTaskDetails.id,
            project_id: projectId,
            user_id: profile.id,
            content,
          });
          await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
        }}
        onEditUpdate={async (id, content) => {
          await supabase.from("task_updates").update({ content }).eq("id", id);
          await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
        }}
        onDeleteUpdate={(id) => void deleteTaskUpdate(id)}
        onReply={async (parentId, content) => {
          if (!selectedTaskDetails || !profile?.id || !projectId) return;
          await supabase.from("task_updates").insert({
            task_id: selectedTaskDetails.id,
            project_id: projectId,
            user_id: profile.id,
            content,
            reply_to: parentId,
          });
          await Promise.all([loadTaskDetailsData(), loadTaskUpdateCounts()]);
        }}
        isSavingUpdate={isSavingUpdate}
      />


      {/* CREATE TASK MODAL */}
      <Modal title="Create Task" isOpen={showCreateTaskModal} onClose={() => { setShowCreateTaskModal(false); setPendingAttachments([]); }}>
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none resize-none"
              rows={3}
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

          <div className="mt-3">
            <label htmlFor="task-start-date" className="text-xs text-gray-500">Start Date</label>
            <input
              id="task-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded px-2 py-1 mt-1"
              disabled={isSubmitting}
            />
          </div>

          <div className="mt-3">
            <label htmlFor="task-end-date" className="text-xs text-gray-500">End Date</label>
            <input
              id="task-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded px-2 py-1 mt-1"
              disabled={isSubmitting}
            />
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
            }}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleCreateTask(newTaskTitle)}
            disabled={isSubmitting || !newTaskTitle.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </Modal>

      {/* ADD MEMBER MODAL */}
      <Modal title="Add Project Member" isOpen={showAddMemberModal} onClose={() => setShowAddMemberModal(false)}>
        <div className="space-y-4">
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
                setSelectedMember(null);
              }}
              disabled={isSubmitting}
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-500">Select a user by name. Role is shown in suggestions.</p>
            {filteredUsers.length > 0 ? (
              <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => {
                      setSelectedMember(user);
                      setNewMemberSearch(user.name ?? user.email ?? "");
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-gray-100"
                  >
                    <span className="font-medium">{user.name ?? user.email ?? "Unknown"}</span>
                    <span className="text-xs italic text-gray-400">{user.job_role ?? "user"}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedMember ? (
              <p className="mt-2 text-xs text-emerald-700">
                Selected: {selectedMember.name ?? selectedMember.email ?? selectedMember.id} ({selectedMember.job_role ?? "user"})
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => setShowAddMemberModal(false)}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleAddMember(selectedMember?.id ?? "")}
            disabled={isSubmitting || !selectedMember?.id}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? "Adding..." : "Add Member"}
          </Button>
        </div>
      </Modal>

      {/* EDIT TASK MODAL */}
      <Modal title="Edit Task" isOpen={Boolean(editingTask)} onClose={() => setEditingTask(null)}>
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none resize-none"
                rows={3}
                placeholder="Add a description..."
                value={editingTask.description ?? ""}
                onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value || null })}
                disabled={isSavingEdit2}
              />
            </div>
            <div>
              <label htmlFor="edit-task-start-date" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                Start Date
              </label>
              <input
                id="edit-task-start-date"
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                value={editingTask.start_date ?? ""}
                onChange={(e) => setEditingTask({ ...editingTask, start_date: e.target.value || null })}
                disabled={isSavingEdit2}
              />
            </div>
            <div>
              <label htmlFor="edit-task-end-date" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                End Date
              </label>
              <input
                id="edit-task-end-date"
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                value={editingTask.end_date ?? ""}
                onChange={(e) => setEditingTask({ ...editingTask, end_date: e.target.value || null })}
                disabled={isSavingEdit2}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setEditingTask(null)}
                disabled={isSavingEdit2}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleUpdateTask()}
                disabled={isSavingEdit2 || !editingTask.title.trim()}
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
