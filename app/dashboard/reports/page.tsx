"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Loader2,
  Filter,
  Sparkles,
  Clock,
  Zap,
  Target,
  ArrowRight,
  Plus,
  UserPlus,
  MessageSquare,
  Reply,
} from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import Avatar from "@/components/ui/Avatar";
import { RenderMentionText } from "@/components/ui/MentionTextarea";
import { useTaskDetailsWorkflow } from "@/components/tasks/useTaskDetailsWorkflow";
import { normalizeStatus, STATUS_CONFIG } from "@/lib/statusConfig";
import {
  computeKPIs,
  computeStatusDistribution,
  computeWorkload,
  computeVelocity,
  getOverdueTasks,
  type AnalyticsTask,
  type AnalyticsLog,
  type AnalyticsAssignee,
  type AnalyticsUser,
  type ProjectKPIs,
} from "@/lib/analytics";
import {
  REPORT_STATUS,
  REPORT_STATUS_KEYS,
  deriveReportStatus,
  getTaskTimerLabel,
  formatTimeDiff,
  computeReportKPIs,
  computeReportStatusDistribution,
  type ReportStatusKey,
  type ReportTask,
} from "@/lib/reportStatus";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

type ProjectInfo = { id: string; name: string | null; start_date?: string | null; created_at?: string | null };
type TabId = "overview" | "board" | "doclist" | "activity" | "ai";

// ── Activity feed types (kept from old reports) ──
type CommentRow = {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
};
type EnrichedComment = {
  id: string;
  projectName: string;
  taskId: string;
  taskName: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userAvatarUrl: string | null;
  content: string;
  createdAt: string;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

function formatDuration(ms: number) {
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
}

const STATUS_LABEL_MAP: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};
function friendlyStatus(s: string | null | undefined): string {
  if (!s) return "Unknown";
  return STATUS_LABEL_MAP[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ActivityEvent = {
  id: string;
  type: "created" | "moved" | "assigned" | "comment" | "reply";
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  taskName: string;
  projectName: string;
  detail: string;
  createdAt: string;
  content?: string; // for comment/reply types
};

// ── KPI Card ────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="absolute inset-0 opacity-[0.03]" style={{ background: `linear-gradient(135deg, ${color}, transparent)` }} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

function getInitialsLabel(name?: string | null, email?: string | null) {
  const cleanName = name?.trim();
  if (cleanName) {
    return cleanName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  const emailPrefix = email?.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  return emailPrefix.slice(0, 2).toUpperCase() || "--";
}

function getDraftWeekLabel(value: string | null | undefined) {
  if (!value) return "Wk--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Wk--";

  const yearStart = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date.getTime() - yearStart.getTime()) / 86400000);
  return `Wk${Math.ceil((dayOffset + yearStart.getDay() + 1) / 7)}`;
}

function getDocumentTypeLabel(projectName: string | null | undefined) {
  const cleanProjectName = projectName?.trim();
  if (!cleanProjectName || cleanProjectName === "—") return "Task";
  const separatorIndex = [...cleanProjectName].findIndex((char) => char === "-" || char === ":" || char === "/" || char === "|");
  const compact = (separatorIndex >= 0 ? cleanProjectName.slice(0, separatorIndex) : cleanProjectName).trim() || cleanProjectName;
  return compact.length > 14 ? `${compact.slice(0, 13)}...` : compact;
}

function getDocumentProgress(status: ReportStatusKey) {
  const progressByStatus: Record<ReportStatusKey, number> = {
    not_started: 0,
    in_progress: 45,
    near_due: 75,
    done_early: 100,
    completed: 100,
    overdue: 85,
  };

  return progressByStatus[status];
}

function getDocumentTimeLeft(task: ReportTask, status: ReportStatusKey) {
  if (status === "completed" || status === "done_early") return "Completed";
  if (status === "overdue") return "Overdue";
  if (!task.end_date) return "--";

  const remaining = new Date(task.end_date).getTime() - Date.now();
  if (Number.isNaN(remaining)) return "--";
  if (remaining <= 0) return "Overdue";
  return formatTimeDiff(remaining);
}

// ════════════════════════════════════════════════
// ── MAIN COMPONENT ─────────────────────────────
// ════════════════════════════════════════════════

export default function ReportsPage() {
  const { profile, supabase } = useAppData();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [projectFilter, setProjectFilter] = useState("all");
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analytics data
  const [tasks, setTasks] = useState<AnalyticsTask[]>([]);
  const [logs, setLogs] = useState<AnalyticsLog[]>([]);
  const [assignees, setAssignees] = useState<AnalyticsAssignee[]>([]);
  const [users, setUsers] = useState<AnalyticsUser[]>([]);
  const [projectMembers, setProjectMembers] = useState<{ project_id: string; user_id: string }[]>([]);

  // Activity feed
  const [comments, setComments] = useState<EnrichedComment[]>([]);

  // AI report
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Report status filter
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatusKey | "all">("all");
  const [timerNow, setTimerNow] = useState<number | null>(null);
  const taskDetailMembers = useMemo(
    () =>
      users.map((user) => ({
        user_id: user.id,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
      })),
    [users],
  );
  const { openTaskDetails, renderTaskDetails } = useTaskDetailsWorkflow({
    supabase,
    profileId: profile?.id ?? null,
    members: taskDetailMembers,
  });

  // ── Load all data ─────────────────────────────
  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      // Fetch projects
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name, start_date, created_at")
        .eq("is_active", true)
        .order("name");
      const projects = (projData ?? []) as ProjectInfo[];
      setAllProjects(projects);
      const projectIds = projects.map((p) => p.id);
      if (projectIds.length === 0) {
        setTasks([]);
        setLogs([]);
        setAssignees([]);
        setUsers([]);
        setComments([]);
        return;
      }

      // Fetch tasks, logs, assignees, users, comments, project_members in parallel
      const [tasksRes, logsRes, assigneesRes, usersRes, commentsRes, pmRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, status, assigned_to, start_date, end_date, created_at, completed_at, project_id, title, description")
          .in("project_id", projectIds),
        supabase
          .from("task_logs")
          .select("id, action, from_status, to_status, created_at, user_id, task_id")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("task_assignees")
          .select("task_id, user_id"),
        supabase
          .from("users")
          .select("id, name, email, avatar_url"),
        supabase
          .from("task_updates")
          .select("id, task_id, project_id, user_id, content, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("project_members")
          .select("project_id, user_id")
          .in("project_id", projectIds),
      ]);

      const allTasks = (tasksRes.data ?? []) as (AnalyticsTask & { project_id?: string; title?: string })[];
      setTasks(allTasks);
      setLogs((logsRes.data ?? []) as (AnalyticsLog & { task_id?: string })[]);
      setAssignees((assigneesRes.data ?? []) as AnalyticsAssignee[]);
      const allUsers = (usersRes.data ?? []) as AnalyticsUser[];
      setUsers(allUsers);
      setProjectMembers((pmRes.data ?? []) as { project_id: string; user_id: string }[]);

      // Enrich comments
      const usersById = new Map(allUsers.map((u) => [u.id, u]));
      const tasksById = new Map(allTasks.map((t: any) => [t.id, t]));
      const projectsById = new Map(projects.map((p) => [p.id, p]));
      const enriched: EnrichedComment[] = ((commentsRes.data ?? []) as CommentRow[]).map((row) => {
        const user = usersById.get(row.user_id);
        const task = tasksById.get(row.task_id) as any;
        const proj = projectsById.get(row.project_id);
        return {
          id: row.id,
          projectName: proj?.name ?? "Unknown",
          taskId: row.task_id,
          taskName: task?.title ?? "Unknown Task",
          userId: row.user_id,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email ?? null,
          userAvatarUrl: user?.avatar_url ?? null,
          content: row.content,
          createdAt: row.created_at,
        };
      });
      setComments(enriched);
    } catch (err) {
      console.error("Reports load error", err);
      setError("Failed to load analytics data.");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setTimerNow(Date.now());
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timerStart = useMemo(() => {
    if (!allProjects.length) return null;

    if (projectFilter === "all") {
      const starts = allProjects
        .map((p) => p.start_date || p.created_at)
        .filter((v): v is string => Boolean(v));
      if (starts.length === 0) return null;
      return Math.min(...starts.map((v) => new Date(v).getTime()));
    }

    const selected = allProjects.find((p) => p.id === projectFilter);
    const value = selected?.start_date || selected?.created_at || null;
    return value ? new Date(value).getTime() : null;
  }, [allProjects, projectFilter]);

  // ── Filter tasks by project ───────────────────
  const filteredTasks = useMemo(() => {
    if (projectFilter === "all") return tasks;
    return tasks.filter((t: any) => t.project_id === projectFilter);
  }, [tasks, projectFilter]);

  const filteredLogs = useMemo(() => {
    if (projectFilter === "all") return logs;
    const taskIds = new Set(filteredTasks.map((t) => t.id));
    return logs.filter((l: any) => taskIds.has(l.task_id));
  }, [logs, filteredTasks, projectFilter]);

  // ── Compute KPIs ──────────────────────────────
  const kpis = useMemo(() => computeKPIs(filteredTasks), [filteredTasks]);
  const statusDist = useMemo(() => computeStatusDistribution(filteredTasks), [filteredTasks]);
  const workload = useMemo(() => computeWorkload(filteredTasks, assignees, users), [filteredTasks, assignees, users]);
  const velocity = useMemo(() => computeVelocity(filteredLogs, 8), [filteredLogs]);
  const overdueTasks = useMemo(() => getOverdueTasks(filteredTasks, users), [filteredTasks, users]);

  // Report-level derived status computations
  const reportKpis = useMemo(() => computeReportKPIs(filteredTasks as ReportTask[]), [filteredTasks]);
  const reportStatusDist = useMemo(() => computeReportStatusDistribution(filteredTasks as ReportTask[]), [filteredTasks]);

  // ── Unified Activity Feed ─────────────────────
  const activityFeed = useMemo<ActivityEvent[]>(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    const tasksById = new Map((tasks as any[]).map((t) => [t.id, t]));
    const projectsById = new Map(allProjects.map((p) => [p.id, p]));
    const events: ActivityEvent[] = [];

    // Task log events
    for (const log of filteredLogs as (AnalyticsLog & { task_id?: string })[]) {
      const user = log.user_id ? usersById.get(log.user_id) : undefined;
      const task = log.task_id ? tasksById.get(log.task_id) : undefined;
      const proj = task?.project_id ? projectsById.get(task.project_id) : undefined;
      let type: ActivityEvent["type"] = "created";
      let detail = "";
      if (log.action === "moved") {
        type = "moved";
        detail = `${friendlyStatus(log.from_status)} → ${friendlyStatus(log.to_status)}`;
      } else if (log.action === "assigned") {
        type = "assigned";
        detail = "Assigned to task";
      } else {
        detail = "Created task";
      }
      events.push({
        id: `log-${log.id}`,
        type,
        userId: log.user_id ?? "",
        userName: user?.name ?? user?.email ?? "Unknown",
        userAvatarUrl: user?.avatar_url ?? null,
        taskName: task?.title ?? "Unknown Task",
        projectName: proj?.name ?? "",
        detail,
        createdAt: log.created_at,
      });
    }

    // Comment/chat events
    for (const c of comments) {
      events.push({
        id: `chat-${c.id}`,
        type: "comment",
        userId: c.userId,
        userName: c.userName,
        userAvatarUrl: c.userAvatarUrl,
        taskName: c.taskName,
        projectName: c.projectName,
        detail: "Posted a message",
        createdAt: c.createdAt,
        content: c.content,
      });
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return events.slice(0, 150);
  }, [filteredLogs, comments, users, tasks, allProjects]);

  const commentCounts = useMemo(() => {
    return comments.reduce<Record<string, number>>((acc, comment) => {
      acc[comment.taskId] = (acc[comment.taskId] ?? 0) + 1;
      return acc;
    }, {});
  }, [comments]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const openReportTaskDetails = useCallback((task: AnalyticsTask & { project_id?: string; title?: string }) => {
    const statusKey = deriveReportStatus(task as ReportTask);
    const statusLabel = REPORT_STATUS[statusKey]?.label ?? "Task";
    const projectName = allProjects.find((p) => p.id === task.project_id)?.name ?? "Untitled project";
    const assignee = task.assigned_to ? usersById.get(task.assigned_to) ?? null : null;
    const assigneeName = assignee?.name ?? assignee?.email ?? "Unassigned";

    openTaskDetails({
      id: task.id,
      projectId: task.project_id ?? "",
      title: task.title ?? "Untitled task",
      status: statusLabel,
      assignee: assigneeName,
      assignees: assignee ? [{ id: assignee.id, name: assignee.name, email: assignee.email }] : [],
      createdAt: task.created_at ?? null,
      createdByName: null,
      projectName,
      startDate: task.start_date ?? null,
      endDate: task.end_date ?? null,
      creator: null,
      description: (task as AnalyticsTask & { description?: string | null }).description ?? null,
    });
  }, [allProjects, openTaskDetails, usersById]);

  const getReportTimer = useCallback((task: ReportTask) => {
    const status = deriveReportStatus(task);
    const label = getTaskTimerLabel(task);
    if (label) return label;

    if (status === "completed") return "completed";
    if (status === "not_started" || status === "in_progress") {
      if (task.end_date) {
        const endMs = new Date(task.end_date).getTime();
        const remaining = endMs - Date.now();
        if (remaining > 0) return `${formatTimeDiff(remaining)} remaining`;
      }
      return "on track";
    }
    return null;
  }, []);

  // ── AI Report generation ──────────────────────
  const [aiProjectFilter, setAiProjectFilter] = useState("all");
  const [aiUserFilter, setAiUserFilter] = useState("all");

  // Reset user filter when project changes
  useEffect(() => {
    setAiUserFilter("all");
  }, [aiProjectFilter]);

  // Filter users by project membership (Part 3)
  const filteredAiUsers = useMemo(() => {
    if (aiProjectFilter === "all") return users;
    const memberIds = new Set(
      projectMembers
        .filter((pm) => pm.project_id === aiProjectFilter)
        .map((pm) => pm.user_id)
    );
    return users.filter((u) => memberIds.has(u.id));
  }, [aiProjectFilter, users, projectMembers]);

  const generateAiReport = useCallback(async () => {
    if (!profile?.id) return;
    setIsGeneratingAi(true);
    setAiReport(null);

    try {
      const projectName = aiProjectFilter === "all"
        ? "All Projects"
        : allProjects.find((p) => p.id === aiProjectFilter)?.name ?? "Unknown";

      let aiTasks = tasks as (AnalyticsTask & { project_id?: string; title?: string; assigned_to?: string | null; description?: string | null })[];
      if (aiProjectFilter !== "all") {
        aiTasks = aiTasks.filter((t: any) => t.project_id === aiProjectFilter);
      }

      const aiKpis = computeKPIs(aiTasks);
      const aiOverdue = getOverdueTasks(aiTasks, users);
      const aiStatusDist = computeStatusDistribution(aiTasks);

      let userInsight = "";
      if (aiUserFilter !== "all") {
        const selectedUser = users.find((u) => u.id === aiUserFilter);
        const userTasks = aiTasks.filter((t: any) => t.assigned_to === aiUserFilter);
        const userKpis = computeKPIs(userTasks);
        userInsight = `\nFOCUS ON USER: ${selectedUser?.name ?? "Unknown"} — ${userKpis.total} tasks, ${userKpis.completed} done, ${userKpis.overdue} overdue`;
      }

      const overdueDetails = aiOverdue.slice(0, 5).map((t: any) => {
        const desc = t.description ? ` — ${t.description}` : "";
        return `${t.title ?? "Untitled"}(${t.daysOverdue}d)${desc}`;
      }).join("; ");

      const reportPrompt = `You are generating an executive project report. Do NOT respond with JSON. Do NOT use markdown ** or *** syntax. Respond ONLY with clean HTML.

Use: <h2> for sections, <strong> for bold, <p> for text, <ul><li> for lists, <span style="color:#10b981"> for green, <span style="color:#f59e0b"> for amber, <span style="color:#ef4444"> for red.

Sections: Executive Summary, Health Assessment, Key Metrics, Risks & Blockers, Completed, Pending, Team Insights, Recommendations.

PROJECT: ${projectName}${userInsight}
Total: ${aiKpis.total}, Done: ${aiKpis.completed} (${aiKpis.completionRate}%), In Progress: ${aiKpis.inProgress}, Review: ${aiKpis.inReview}, Overdue: ${aiKpis.overdue}, Near Due: ${aiKpis.nearDue}
Status: ${aiStatusDist.map(s => `${s.label}:${s.count}`).join(', ')}
Overdue: ${aiOverdue.slice(0, 5).map((t: any) => `${t.title ?? "Untitled"}(${t.daysOverdue}d)`).join('; ') || 'None'}
Overdue Details (include descriptions): ${overdueDetails || 'None'}

Be concise and professional.`;

      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: reportPrompt }),
      });

      const data = await res.json();

      if (data.error) {
        setAiReport(data.error);
        return;
      }

      let content = data?.content ?? "";
      if (typeof content === "string") {
        const trimmed = content.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try { const p = JSON.parse(trimmed); content = p.message ?? p.content ?? trimmed; } catch { /* not JSON */ }
        }
        content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        content = content.replace(/^### (.*$)/gm, '<h3 style="font-size:15px;font-weight:600;color:#1e293b;margin:16px 0 8px">$1</h3>');
        content = content.replace(/^## (.*$)/gm, '<h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:20px 0 8px">$1</h2>');
        content = content.replace(/^# (.*$)/gm, '<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:24px 0 10px">$1</h2>');
        content = content.replace(/^- (.*$)/gm, '<li style="margin-left:16px;margin-bottom:4px;color:#334155">$1</li>');
        content = content.replace(/\n\n/g, '<div style="margin-top:12px"></div>');
        content = content.replace(/\n/g, "<br/>");
      }
      setAiReport(content || "Failed to generate report.");
    } catch (err) {
      console.error("AI report error", err);
      setAiReport("Failed to generate report. Please try again.");
    } finally {
      setIsGeneratingAi(false);
    }
  }, [profile?.id, aiProjectFilter, aiUserFilter, allProjects, tasks, users]);

  // ── Tab buttons ───────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "board", label: "Board", icon: BarChart3 },
    { id: "doclist", label: "Document List", icon: Filter },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "ai", label: "AI Report", icon: Sparkles },
  ];

  // ════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────
  // ════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-slate-400">Analytics</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-slate-900">Reports</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
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
            <Filter size={14} className="text-slate-400" />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-300 focus:outline-none"
            >
              <option value="all">All Projects</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name ?? "Unknown"}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-red-600">{error}</div>
      ) : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* KPI Row — 6 report-status cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Total Tasks" value={reportKpis.total} icon={BarChart3} color="#6366f1" subtitle={`${reportKpis.completionRate}% complete`} />
                <KpiCard label="Not Started" value={reportKpis.notStarted} icon={Target} color={REPORT_STATUS.not_started.color} />
                <KpiCard label="In Progress" value={reportKpis.inProgress} icon={TrendingUp} color={REPORT_STATUS.in_progress.color} />
                <KpiCard label="Near Due" value={reportKpis.nearDue} icon={Clock} color={REPORT_STATUS.near_due.color} subtitle="< 48h remaining" />
                <KpiCard label="Done Early" value={reportKpis.doneEarly} icon={Zap} color={REPORT_STATUS.done_early.color} />
                <KpiCard label="Overdue" value={reportKpis.overdue} icon={AlertTriangle} color={REPORT_STATUS.overdue.color} />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Status Distribution Pie */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status Distribution</p>
                  <div className="mt-4 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={reportStatusDist.filter((d) => d.count > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="count"
                          nameKey="label"
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {reportStatusDist.filter((d) => d.count > 0).map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-4">
                    {reportStatusDist.map((d) => (
                      <div key={d.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.label}: {d.count}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Velocity Line Chart */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completion Velocity</p>
                  <p className="mt-1 text-[11px] text-slate-400">Tasks completed per week (last 8 weeks)</p>
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={velocity}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="completed"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          dot={{ fill: "#6366f1", r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Workload + Overdue Row */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Workload Bar Chart */}
                <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Team Workload</p>
                  {workload.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No assigned tasks found.</p>
                  ) : (
                    <div className="mt-4 flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height={Math.max(180, workload.length * 40)}>
                        <BarChart data={workload.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 11, fill: "#475569" }}
                            width={100}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid #e2e8f0",
                              fontSize: "12px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                            }}
                          />
                          <Bar dataKey="completed" stackId="a" fill="#10b981" name="Done" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="inProgress" stackId="a" fill="#f59e0b" name="Active" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="overdue" stackId="a" fill="#ef4444" name="Overdue" radius={[0, 4, 4, 0]} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Overdue Tasks List */}
                <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Overdue Tasks</p>
                  {overdueTasks.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
                      <CheckCircle2 size={28} />
                      <p className="text-sm">No overdue tasks!</p>
                    </div>
                  ) : (
                    <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                      {overdueTasks.slice(0, 15).map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50/50 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{t.title ?? "Untitled"}</p>
                            <p className="text-[11px] text-slate-500">{t.assigneeName}</p>
                          </div>
                          <span className="ml-2 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                            {t.daysOverdue}d overdue
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ BOARD TAB ═══ */}
          {activeTab === "board" && (() => {
            const allReportTasks = (filteredTasks as (AnalyticsTask & { project_id?: string; title?: string; description?: string | null; assigned_to?: string | null })[]).map((t) => ({
              ...t,
              _reportStatus: deriveReportStatus(t as ReportTask),
              _timerLabel: getTaskTimerLabel(t as ReportTask),
              _commentCount: commentCounts[t.id] ?? 0,
              _assignee: t.assigned_to ? usersById.get(t.assigned_to) ?? null : null,
            }));

            const boardFiltered = reportStatusFilter === "all"
              ? allReportTasks
              : allReportTasks.filter((t) => t._reportStatus === reportStatusFilter);

            const grouped: Record<ReportStatusKey, typeof allReportTasks> = {
              not_started: [], in_progress: [], near_due: [], done_early: [], completed: [], overdue: [],
            };
            boardFiltered.forEach((t) => { grouped[t._reportStatus]?.push(t); });

            return (
              <div className="space-y-4">
                {/* Filter chips */}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setReportStatusFilter("all")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${reportStatusFilter === "all" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >All ({allReportTasks.length})</button>
                  {REPORT_STATUS_KEYS.map((key) => {
                    const cfg = REPORT_STATUS[key];
                    const count = allReportTasks.filter((t) => t._reportStatus === key).length;
                    return (
                      <button key={key} type="button" onClick={() => setReportStatusFilter(key)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${reportStatusFilter === key ? "text-white" : `border ${cfg.border} ${cfg.bg} ${cfg.text} hover:brightness-95`}`}
                        style={reportStatusFilter === key ? { backgroundColor: cfg.color } : undefined}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: reportStatusFilter === key ? "#fff" : cfg.color }} />
                        {cfg.label} ({count})
                      </button>
                    );
                  })}
                </div>
                {/* Board columns */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                  {REPORT_STATUS_KEYS.map((key) => {
                    const cfg = REPORT_STATUS[key];
                    const colTasks = grouped[key];
                    return (
                      <div key={key}>
                        <div className="mb-2 flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: cfg.color + "15" }}>
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: cfg.color }}>{cfg.label}</span>
                          <span className="text-xs font-bold" style={{ color: cfg.color }}>{colTasks.length}</span>
                        </div>
                        <div className="space-y-2">
                          {colTasks.map((t: any) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openReportTaskDetails(t)}
                              className={`w-full rounded-xl border bg-white/90 p-3 text-left shadow-[0_12px_24px_-20px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(15,23,42,0.55)] ${cfg.border}`}
                              style={{ borderLeftWidth: "4px", borderLeftColor: cfg.color }}
                            >
                              <p className="text-sm font-semibold text-slate-900 line-clamp-2">{t.title ?? "Untitled"}</p>
                              {t.end_date && (
                                <p className="mt-1 text-[11px] text-slate-400">Due: {new Date(t.end_date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</p>
                              )}
                              {getReportTimer(t) && (
                                <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                                  {getReportTimer(t)}
                                </span>
                              )}
                              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                <div className="flex items-center gap-1">
                                  <MessageSquare size={12} />
                                  {t._commentCount}
                                </div>
                                <div className="flex items-center gap-2">
                                  {t._assignee ? (
                                    <>
                                      <Avatar
                                        userId={t._assignee.id}
                                        name={t._assignee.name}
                                        email={t._assignee.email}
                                        avatarUrl={t._assignee.avatar_url}
                                        size="xs"
                                      />
                                      <span className="text-slate-600">
                                        {t._assignee.name ?? t._assignee.email ?? "Unassigned"}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Unassigned</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                          {colTasks.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">No tasks</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ═══ DOCUMENT LIST TAB ═══ */}
          {activeTab === "doclist" && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[86px]" />
                    <col className="w-[260px]" />
                    <col className="w-[132px]" />
                    <col className="w-[92px]" />
                    <col className="w-[82px]" />
                    <col className="w-[128px]" />
                    <col className="w-[132px]" />
                    <col className="w-[104px]" />
                    <col className="w-[72px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Doc ID</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Document Title</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</th>
                      <th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Lead</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Draft</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Progress</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Time Left</th>
                      <th className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredTasks as any[]).map((t, i) => {
                      const rStatus = deriveReportStatus(t as ReportTask);
                      const rCfg = REPORT_STATUS[rStatus];
                      const projName = allProjects.find((p) => p.id === t.project_id)?.name ?? "—";
                      const assignee = t.assigned_to ? usersById.get(t.assigned_to) ?? null : null;
                      const docId = `DOC-${String(i + 1).padStart(2, "0")}`;
                      const typeLabel = getDocumentTypeLabel(projName);
                      const draftWeek = getDraftWeekLabel(t.created_at);
                      const progress = getDocumentProgress(rStatus);
                      const timeLeft = getDocumentTimeLeft(t as ReportTask, rStatus);
                      const commentsCount = commentCounts[t.id] ?? 0;
                      return (
                        <tr
                          key={t.id}
                          onClick={() => openReportTaskDetails(t)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openReportTaskDetails(t);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/80 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300"
                        >
                          <td className="px-3 py-2.5 align-middle">
                            <span className="font-mono text-[11px] font-semibold text-slate-500">{docId}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <p className="truncate text-[13px] font-semibold text-slate-900" title={t.title ?? "Untitled"}>
                              {t.title ?? "Untitled"}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className="inline-flex max-w-full items-center truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600" title={projName}>
                              {typeLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex justify-center">
                              <Avatar
                                userId={assignee?.id}
                                name={assignee?.name}
                                email={assignee?.email}
                                avatarUrl={assignee?.avatar_url}
                                size="xs"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className="text-[12px] font-medium text-slate-600">{draftWeek}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${rCfg.bg} ${rCfg.text} ${rCfg.border}`}>
                              {rCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: rCfg.color }} />
                              </div>
                              <span className="w-8 text-right text-[11px] font-medium text-slate-500">{progress}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <span className={`text-[12px] font-semibold ${rCfg.text}`}>{timeLeft}</span>
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-600">
                              <MessageSquare size={13} className="text-slate-400" />
                              {commentsCount}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredTasks.length === 0 && <div className="py-12 text-center text-sm text-slate-400">No tasks found.</div>}
            </div>
          )}

          {/* ═══ ACTIVITY TAB ═══ */}
          {activeTab === "activity" && (
            <div className="space-y-1">
              {activityFeed.length === 0 ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
                  <Activity size={32} />
                  <p className="text-sm">No recent activity.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[19px] top-6 bottom-6 w-px bg-slate-200" />
                  <div className="space-y-0">
                    {activityFeed.map((evt) => {
                      let Icon = Activity;
                      let iconColor = "#64748b";
                      let iconBg = "bg-slate-100";
                      if (evt.type === "created") { Icon = Plus; iconColor = "#10b981"; iconBg = "bg-emerald-50"; }
                      else if (evt.type === "moved") { Icon = ArrowRight; iconColor = "#3b82f6"; iconBg = "bg-blue-50"; }
                      else if (evt.type === "assigned") { Icon = UserPlus; iconColor = "#8b5cf6"; iconBg = "bg-violet-50"; }
                      else if (evt.type === "comment") { Icon = MessageSquare; iconColor = "#f59e0b"; iconBg = "bg-amber-50"; }
                      else if (evt.type === "reply") { Icon = Reply; iconColor = "#06b6d4"; iconBg = "bg-cyan-50"; }

                      return (
                        <div key={evt.id} className="relative flex gap-3 py-3 pl-0">
                          {/* Icon dot */}
                          <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                            <Icon size={16} style={{ color: iconColor }} />
                          </div>
                          {/* Content */}
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-900">{evt.userName}</span>
                              <span className="text-xs text-slate-400">{evt.detail}</span>
                              {evt.projectName && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{evt.projectName}</span>}
                            </div>
                            <p className="mt-0.5 text-[13px] text-slate-600 truncate">
                              <span className="font-medium text-slate-700">{evt.taskName}</span>
                            </p>
                            {evt.content && (
                              <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[13px] text-slate-600 leading-relaxed">
                                <RenderMentionText text={evt.content} />
                              </div>
                            )}
                            <p className="mt-1 text-[11px] text-slate-400">{relativeTime(evt.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ AI REPORT TAB ═══ */}
          {activeTab === "ai" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900 mb-4">AI Executive Report</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Project</label>
                    <select value={aiProjectFilter} onChange={(e) => setAiProjectFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-300">
                      <option value="all">All Projects</option>
                      {allProjects.map((p) => <option key={p.id} value={p.id}>{p.name ?? "Unknown"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">User</label>
                    <select value={aiUserFilter} onChange={(e) => setAiUserFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-300">
                      <option value="all">All Users</option>
                      {filteredAiUsers.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email ?? "Unknown"}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateAiReport()}
                    disabled={isGeneratingAi}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isGeneratingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {isGeneratingAi ? "Generating..." : "Generate Report"}
                  </button>
                </div>
              </div>


              {aiReport && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="prose prose-sm prose-slate max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-4 [&_h3]:mb-2 [&_strong]:font-semibold [&_li]:ml-4 [&_li]:text-slate-700" dangerouslySetInnerHTML={{ __html: aiReport }} />
                </div>
              )}
            </div>
          )}
        </>
      )}
      {renderTaskDetails()}
    </div>
  );
}
