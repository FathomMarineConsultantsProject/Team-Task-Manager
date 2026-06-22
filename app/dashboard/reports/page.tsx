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
import { getTaskBarSpan, startOfWeek, endOfWeek } from "@/lib/roadmap";
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

const CLIENT_STATUS_COLORS = {
  todo: "#6D4AF2",
  inProgress: "#00B8D9",
  inReview: "#F59E0B",
  completed: "#16A34A",
  overdue: "#EF4444",
  nearDue: "#F97316",
};

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

function clientPreviewStatusColor(statusKey: ReportStatusKey | string, statusLabel?: string) {
  const normalizedLabel = (statusLabel ?? "").toLowerCase();
  if (statusKey === "not_started") return CLIENT_STATUS_COLORS.todo;
  if (statusKey === "in_progress") {
    return normalizedLabel.includes("review") ? CLIENT_STATUS_COLORS.inReview : CLIENT_STATUS_COLORS.inProgress;
  }
  if (statusKey === "near_due") return CLIENT_STATUS_COLORS.nearDue;
  if (statusKey === "done_early" || statusKey === "completed") return CLIENT_STATUS_COLORS.completed;
  if (statusKey === "overdue") return CLIENT_STATUS_COLORS.overdue;
  if (statusKey === "in_review" || normalizedLabel.includes("review")) return CLIENT_STATUS_COLORS.inReview;
  return "#64748b";
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

type ReportTaskWithDetails = AnalyticsTask & {
  title?: string | null;
  description?: string | null;
  project_id?: string;
  updated_at?: string | null;
};

type ReportTaskItem = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  status: string;
  statusKey: ReportStatusKey;
  color: string;
  projectName?: string;
};

type GanttPdfItem = ReportTaskItem & {
  startValue: string | null;
  endValue: string | null;
  left: number;
  width: number;
};

type DetailedTaskRegisterItem = ReportTaskItem & {
  progress: number;
  startDate: string;
  timeLeft: string;
  comments: number;
  description: string;
  priority: string;
};

type TeamContributionRow = {
  userId: string;
  name: string;
  completed: number;
  active: number;
  overdue: number;
  total: number;
  utilization: number;
};

type ProjectLeadInfo = {
  owner: string;
  primaryLead: string;
  supportingLeads: string[];
  leadNames: string[];
};

type ExecutiveReportData = {
  audience: "internal" | "client";
  projectName: string;
  generatedAt: string;
  leads: ProjectLeadInfo;
  health: {
    label: string;
    riskLevel: "Low" | "Medium" | "High";
    healthScore: number;
    progressScore: number;
    completionRate: number;
    overdueCount: number;
  };
  kpis: {
    total: number;
    completed: number;
    inProgress: number;
    nearDue: number;
    overdue: number;
  };
  statusDistribution: { label: string; count: number; color: string }[];
  statusSummary: {
    todo: number;
    inProgress: number;
    inReview: number;
    completed: number;
    overdue: number;
  };
  gantt: {
    rangeStart: string;
    rangeEnd: string;
    currentWeekLeft: number | null;
    tasks: GanttPdfItem[];
  };
  timeline: ReportTaskItem[];
  team: TeamContributionRow[];
  resource: {
    averageUtilization: number;
    overloaded: TeamContributionRow[];
    underutilized: TeamContributionRow[];
  };
  risks: {
    overdue: ReportTaskItem[];
    nearDue: ReportTaskItem[];
    stale: ReportTaskItem[];
    inactive: ReportTaskItem[];
  };
  actions: DetailedTaskRegisterItem[];
  breakdown: {
    completed: ReportTaskItem[];
    inProgress: ReportTaskItem[];
    overdue: ReportTaskItem[];
    upcoming: ReportTaskItem[];
  };
  taskRegister: DetailedTaskRegisterItem[];
  recommendations: string[];
};

type UserWorkHistoryItem = ReportTaskItem & {
  assignedDate: string;
  completedDate: string;
};

type UserActivityItem = {
  id: string;
  type: string;
  detail: string;
  taskName: string;
  createdAt: string;
};

type UserPerformanceReportData = {
  userName: string;
  projectName: string;
  generatedAt: string;
  summary: {
    completionRate: number;
    activeTasks: number;
    overdueTasks: number;
    nearDueTasks: number;
    totalAssignments: number;
  };
  workHistory: UserWorkHistoryItem[];
  responsibilities: {
    active: ReportTaskItem[];
    nearDue: ReportTaskItem[];
    overdue: ReportTaskItem[];
  };
  contribution: {
    completedTasks: number;
    commentsAdded: number;
    activityCount: number;
    assignmentsHandled: number;
  };
  recentComments: UserActivityItem[];
  activityTimeline: UserActivityItem[];
  workload: {
    utilizationScore: number;
    taskVolume: number;
    bottlenecks: string[];
  };
  assessment: {
    strengths: string[];
    concerns: string[];
    recommendations: string[];
  };
};

type GeneratedAiReport =
  | { type: "project"; audience: "internal" | "client"; data: ExecutiveReportData }
  | { type: "user"; data: UserPerformanceReportData };

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

function getTaskPriority(status: ReportStatusKey) {
  if (status === "overdue") return "High";
  if (status === "near_due") return "Medium";
  if (status === "in_progress") return "Normal";
  return "Low";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatReportDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function getTaskOwner(task: ReportTaskWithDetails, usersById: Map<string, AnalyticsUser>) {
  const user = task.assigned_to ? usersById.get(task.assigned_to) : null;
  return user?.name ?? user?.email ?? "Unassigned";
}

function toReportTaskItem(
  task: ReportTaskWithDetails,
  usersById: Map<string, AnalyticsUser>,
  projectsById: Map<string, ProjectInfo>,
): ReportTaskItem {
  const statusKey = deriveReportStatus(task as ReportTask);
  const status = REPORT_STATUS[statusKey];
  return {
    id: task.id,
    title: task.title ?? "Untitled task",
    owner: getTaskOwner(task, usersById),
    dueDate: formatReportDate(task.end_date),
    status: status.label,
    statusKey,
    color: status.color,
    projectName: task.project_id ? projectsById.get(task.project_id)?.name ?? undefined : undefined,
  };
}

function isStaleReportTask(task: ReportTaskWithDetails) {
  if (deriveReportStatus(task as ReportTask) === "completed" || deriveReportStatus(task as ReportTask) === "done_early") return false;
  const reference = task.updated_at ?? task.created_at;
  if (!reference) return false;
  const ageDays = (Date.now() - new Date(reference).getTime()) / 86400000;
  return ageDays >= 14;
}

function isInactiveReportTask(task: ReportTaskWithDetails) {
  if (deriveReportStatus(task as ReportTask) === "completed" || deriveReportStatus(task as ReportTask) === "done_early") return false;
  if (!task.assigned_to) return true;
  const reference = task.updated_at ?? task.created_at;
  if (!reference) return false;
  const ageDays = (Date.now() - new Date(reference).getTime()) / 86400000;
  return ageDays >= 21;
}

function parseAiRecommendationText(value: string) {
  const withoutTags = value
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

  return withoutTags
    .split(/\n|(?:^|\s)[•-]\s+/)
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildFallbackRecommendations(data: {
  overdueCount: number;
  nearDueCount: number;
  staleCount: number;
  overloadedUsers: number;
  completionRate: number;
}) {
  const recommendations: string[] = [];
  if (data.overdueCount > 0) recommendations.push("Prioritize overdue ownership review and resolve blocked tasks before adding new scope.");
  if (data.nearDueCount > 0) recommendations.push("Run a near-due checkpoint within 24 hours and confirm owners, blockers, and delivery dates.");
  if (data.staleCount > 0) recommendations.push("Refresh stale tasks with status updates, next actions, or closure decisions.");
  if (data.overloadedUsers > 0) recommendations.push("Rebalance workload from overloaded users to available contributors.");
  if (data.completionRate < 60) recommendations.push("Focus execution on the smallest set of high-impact tasks needed to lift completion rate.");
  return recommendations.length ? recommendations : ["Maintain current delivery cadence and continue monitoring near-due and workload signals."];
}

function getRiskLevel(overdueCount: number, nearDueCount: number, staleCount: number): "Low" | "Medium" | "High" {
  if (overdueCount >= 3 || staleCount >= 5) return "High";
  if (overdueCount > 0 || nearDueCount >= 3 || staleCount > 0) return "Medium";
  return "Low";
}

function parseReportDateValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bestReportStartDate(task: ReportTaskWithDetails) {
  return parseReportDateValue(task.start_date ?? task.created_at ?? task.updated_at ?? task.completed_at) ?? new Date();
}

function bestReportEndDate(task: ReportTaskWithDetails) {
  const status = deriveReportStatus(task as ReportTask);
  const fallback = task.end_date ?? task.completed_at ?? task.updated_at ?? task.start_date ?? task.created_at;
  if (status === "completed" || status === "done_early") {
    return parseReportDateValue(task.completed_at ?? fallback) ?? bestReportStartDate(task);
  }
  return parseReportDateValue(fallback) ?? bestReportStartDate(task);
}

function getProjectLeadInfo(
  projectId: string,
  projectMembers: { project_id: string; user_id: string; role?: string | null }[],
  usersById: Map<string, AnalyticsUser>,
  teamRows: TeamContributionRow[],
): ProjectLeadInfo {
  const members = projectMembers.filter((member) => member.project_id === projectId);
  const named = (userId: string) => {
    const user = usersById.get(userId);
    return user?.name ?? user?.email ?? "Unknown";
  };
  const owners = members.filter((member) => ["owner", "creator"].includes((member.role ?? "").toLowerCase())).map((member) => named(member.user_id));
  const leads = members.filter((member) => (member.role ?? "").toLowerCase() === "lead").map((member) => named(member.user_id));
  const owner = owners[0] ?? teamRows[0]?.name ?? "Not assigned";
  const leadNames = Array.from(new Set(leads.length > 0 ? leads : owner !== "Not assigned" ? [owner] : []));
  const primaryLead = leadNames[0] ?? "Not assigned";
  const supportingLeads = leadNames.slice(1);
  return { owner, primaryLead, supportingLeads, leadNames };
}

function formatLeadDisplay(leads: ProjectLeadInfo) {
  const names = leads.leadNames?.length ? leads.leadNames : [leads.primaryLead].filter((name) => name && name !== "Not assigned");
  return {
    label: names.length > 1 ? "Leads" : "Lead",
    value: names.length > 0 ? names.join(", ") : "Not assigned",
  };
}

function buildGanttPdfData(
  tasks: ReportTaskWithDetails[],
  usersById: Map<string, AnalyticsUser>,
  projectsById: Map<string, ProjectInfo>,
) {
  const datedTasks = tasks
    .map((task) => {
      const start = bestReportStartDate(task);
      const end = bestReportEndDate(task);
      return { task, start, end };
    })
    .filter((item): item is { task: ReportTaskWithDetails; start: Date; end: Date } => Boolean(item.start && item.end));

  if (datedTasks.length === 0) {
    const today = new Date();
    const start = startOfWeek(today);
    const end = endOfWeek(start);
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString(), currentWeekLeft: 0, tasks: [] as GanttPdfItem[] };
  }

  const minTime = Math.min(...datedTasks.map((item) => item.start.getTime()));
  const maxTime = Math.max(...datedTasks.map((item) => item.end.getTime()));
  const rangeStart = startOfWeek(new Date(minTime));
  const rangeEnd = endOfWeek(new Date(maxTime));
  const today = new Date();
  const currentWeek = startOfWeek(today);
  const spanMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());
  const currentWeekLeft = currentWeek >= rangeStart && currentWeek <= rangeEnd
    ? Math.max(0, Math.min(100, ((currentWeek.getTime() - rangeStart.getTime()) / spanMs) * 100))
    : null;

  const ganttTasks = datedTasks
    .map(({ task, start, end }) => {
      const span = getTaskBarSpan(start, end, rangeStart, rangeEnd);
      if (!span) return null;
      const item: GanttPdfItem = {
        ...toReportTaskItem(task, usersById, projectsById),
        startValue: start.toISOString(),
        endValue: end.toISOString(),
        left: span.left,
        width: span.width,
      };
      return item;
    })
    .filter((item): item is GanttPdfItem => item !== null)
    .sort((left, right) => (parseReportDateValue(left.startValue)?.getTime() ?? 0) - (parseReportDateValue(right.startValue)?.getTime() ?? 0));

  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    currentWeekLeft,
    tasks: ganttTasks,
  };
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm overflow-hidden">
      <h2 className="text-base font-bold uppercase tracking-[0.14em] text-slate-600">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple" }) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-900 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-violet-50 text-violet-700 border-violet-200",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function TaskTable({ tasks, emptyLabel = "No tasks" }: { tasks: ReportTaskItem[]; emptyLabel?: string }) {
  if (tasks.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-slate-50">
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            <th className="w-[40%] px-3 py-2">Task</th>
            <th className="w-[20%] px-3 py-2">Owner</th>
            <th className="w-[18%] px-3 py-2">Due</th>
            <th className="w-[22%] px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-900 break-words" title={task.title}>{task.title}</td>
              <td className="px-3 py-2 text-slate-600 truncate" title={task.owner}>{task.owner}</td>
              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{task.dueDate}</td>
              <td className="px-3 py-2">
                <span className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${task.color}18`, color: task.color }}>
                  {task.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutiveReport({ report }: { report: ExecutiveReportData }) {
  if (report.audience === "client") return <ClientExecutiveReport report={report} />;

  const riskTone = report.health.riskLevel === "High" ? "red" : report.health.riskLevel === "Medium" ? "amber" : "green";
  const healthDot = report.health.riskLevel === "High" ? "🔴" : report.health.riskLevel === "Medium" ? "🟡" : "🟢";
  const healthLabel = report.health.riskLevel === "High" ? "At Risk" : report.health.riskLevel === "Medium" ? "Attention Required" : "Healthy";
  const activeTasks = Math.max(0, report.kpis.total - report.kpis.completed);
  const leadDisplay = formatLeadDisplay(report.leads);

  return (
    <div className="space-y-6">
      {/* ── Cover Page ── */}
      <div className="rounded-2xl border border-slate-800 bg-[#050816] p-8 text-white shadow-lg">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Powered by</p>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">Fathom Marine Consultancy</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">Executive Reporting System</p>
        <h2 className="mt-6 text-3xl font-bold tracking-tight">{report.projectName}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
          <span>Owner: <strong className="text-white">{report.leads.owner}</strong></span>
          <span className="text-slate-600">•</span>
          <span>{leadDisplay.label}: <strong className="text-white">{leadDisplay.value}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Generated: <strong className="text-white">{formatDate(report.generatedAt)}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Team: <strong className="text-white">{report.team.length} members</strong></span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-lg">{healthDot}</span>
          <span className="text-base font-bold text-white">{healthLabel}</span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ["Completion", `${report.health.completionRate}%`],
            ["Active Tasks", activeTasks],
            ["Overdue", report.kpis.overdue],
            ["Risk Level", report.health.riskLevel],
            ["Team Size", report.team.length],
            ["Health Score", report.health.healthScore],
          ] as [string, string | number][]).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/[0.07] px-3 py-2.5 text-center backdrop-blur-sm">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Executive Summary ── */}
      <ReportSection title="1. Executive Summary">
        <div className="grid gap-3 md:grid-cols-6">
          <MiniMetric label="Health" value={healthLabel} tone={riskTone} />
          <MiniMetric label="Completion" value={`${report.health.completionRate}%`} tone="green" />
          <MiniMetric label="Active" value={activeTasks} tone="blue" />
          <MiniMetric label="Overdue" value={report.health.overdueCount} tone={report.health.overdueCount ? "red" : "green"} />
          <MiniMetric label="Risk Level" value={report.health.riskLevel} tone={riskTone} />
          <MiniMetric label="Team Size" value={report.team.length} tone="purple" />
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          {report.recommendations.map((item, i) => (
            <li key={`rec-${i}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 leading-relaxed">{item}</li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="2. Project Health Dashboard">
        <div className="grid gap-3 md:grid-cols-5">
          <MiniMetric label="Total Tasks" value={report.kpis.total} />
          <MiniMetric label="Completed" value={report.kpis.completed} tone="green" />
          <MiniMetric label="In Progress" value={report.kpis.inProgress} tone="blue" />
          <MiniMetric label="Near Due" value={report.kpis.nearDue} tone="amber" />
          <MiniMetric label="Overdue" value={report.kpis.overdue} tone={report.kpis.overdue ? "red" : "green"} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            {report.statusDistribution.map((status) => (
              <div key={status.label}>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{status.label}</span>
                  <span>{status.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${report.kpis.total ? (status.count / report.kpis.total) * 100 : 0}%`, backgroundColor: status.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Health Score" value={report.health.healthScore} tone={riskTone} />
            <MiniMetric label="Progress Score" value={report.health.progressScore} tone="blue" />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="3. Timeline Section">
        <div className="space-y-2">
          {report.timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No active timeline risks.</div>
          ) : (
            report.timeline.map((task) => (
              <div key={task.id} className="grid items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 md:grid-cols-[180px_1fr_120px]">
                <span className="text-xs font-semibold text-slate-500">{task.dueDate}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: task.statusKey === "overdue" ? "100%" : task.statusKey === "near_due" ? "78%" : "52%", backgroundColor: task.color }} />
                  </div>
                </div>
                <span className="text-xs font-semibold" style={{ color: task.color }}>{task.status}</span>
              </div>
            ))
          )}
        </div>
      </ReportSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="4. Team Contribution">
          <TaskTeamTable rows={report.team} />
        </ReportSection>

        <ReportSection title="5. Resource Utilization">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Avg Utilization" value={`${report.resource.averageUtilization}%`} tone="blue" />
            <MiniMetric label="Overloaded" value={report.resource.overloaded.length} tone={report.resource.overloaded.length ? "red" : "green"} />
            <MiniMetric label="Underutilized" value={report.resource.underutilized.length} tone="amber" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Overloaded Users</p>
              <UserList rows={report.resource.overloaded} emptyLabel="No overloaded users" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Underutilized Users</p>
              <UserList rows={report.resource.underutilized} emptyLabel="No underutilized users" />
            </div>
          </div>
        </ReportSection>
      </div>

      {/* ── 6. Gantt Timeline ── */}
      <ReportSection title="6. Gantt Timeline">
        {report.gantt.tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No tasks with date ranges.</div>
        ) : (() => {
          const start = new Date(report.gantt.rangeStart).getTime();
          const end = new Date(report.gantt.rangeEnd).getTime();
          const span = Math.max(1, end - start);
          const months: { label: string; left: number }[] = [];
          const cursor = new Date(report.gantt.rangeStart);
          cursor.setDate(1);
          while (cursor.getTime() <= end) {
            const pos = Math.max(0, Math.min(100, ((cursor.getTime() - start) / span) * 100));
            months.push({ label: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }), left: pos });
            cursor.setMonth(cursor.getMonth() + 1);
          }
          return (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 900 }}>
                <div className="flex border-b border-slate-200 pb-1 mb-2">
                  <div className="w-[220px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2">Task</div>
                  <div className="w-[90px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2">Owner</div>
                  <div className="w-[70px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2">Status</div>
                  <div className="flex-1 relative" style={{ minWidth: 400 }}>
                    {months.map((m) => (
                      <span key={m.label} className="absolute text-[9px] font-semibold text-slate-400 -top-0.5" style={{ left: `${m.left}%` }}>{m.label}</span>
                    ))}
                  </div>
                </div>
                {report.gantt.tasks.map((task, i) => (
                  <div key={task.id} className={`flex items-center py-1.5 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"} border-b border-slate-100`}>
                    <div className="w-[220px] shrink-0 px-2 text-xs font-medium text-slate-900 break-words leading-tight" title={task.title}>{task.title}</div>
                    <div className="w-[90px] shrink-0 px-2 text-[11px] text-slate-500 truncate" title={task.owner}>{task.owner}</div>
                    <div className="w-[70px] shrink-0 px-2">
                      <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${task.color}18`, color: task.color }}>{task.status}</span>
                    </div>
                    <div className="flex-1 relative h-5" style={{ minWidth: 400 }}>
                      {report.gantt.currentWeekLeft !== null && i === 0 && (
                        <div className="absolute top-0 bottom-0 w-px bg-slate-900 z-10" style={{ left: `${report.gantt.currentWeekLeft}%` }} />
                      )}
                      <div className="absolute rounded-sm h-3 top-1" style={{ left: `${Math.max(0, Math.min(99, task.left))}%`, width: `${Math.max(1.5, Math.min(100 - task.left, task.width))}%`, backgroundColor: task.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </ReportSection>

      {/* ── 7. Risk Register ── */}
      <ReportSection title="7. Risk Register">
        {(() => {
          const allRisks = [
            ...report.risks.overdue.map(t => ({ ...t, impact: "High schedule impact", severity: "High" as const })),
            ...report.risks.nearDue.map(t => ({ ...t, impact: "Near-term delivery risk", severity: "Medium" as const })),
            ...report.risks.stale.map(t => ({ ...t, impact: "Stale execution signal", severity: "Medium" as const })),
            ...report.risks.inactive.map(t => ({ ...t, impact: "Inactive ownership", severity: "Low" as const })),
          ];
          if (allRisks.length === 0) return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No risks identified.</div>;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed min-w-[700px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    <th className="w-[30%] px-3 py-2">Risk</th>
                    <th className="w-[22%] px-3 py-2">Impact</th>
                    <th className="w-[12%] px-3 py-2">Severity</th>
                    <th className="w-[18%] px-3 py-2">Owner</th>
                    <th className="w-[18%] px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRisks.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900 break-words" title={r.title}>{r.title}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{r.impact}</td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${r.severity === "High" ? "bg-red-50 text-red-700" : r.severity === "Medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{r.severity}</span></td>
                      <td className="px-3 py-2 text-slate-600 truncate" title={r.owner}>{r.owner}</td>
                      <td className="px-3 py-2"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${r.color}18`, color: r.color }}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </ReportSection>

      {/* ── 8. Action Tracker ── */}
      <ReportSection title="8. Action Tracker">
        {report.actions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No immediate actions.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[600px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <th className="w-[35%] px-3 py-2">Action</th>
                  <th className="w-[20%] px-3 py-2">Owner</th>
                  <th className="w-[18%] px-3 py-2">Due Date</th>
                  <th className="w-[15%] px-3 py-2">Status</th>
                  <th className="w-[12%] px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {report.actions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900 break-words" title={t.title}>{t.title}</td>
                    <td className="px-3 py-2 text-slate-600 truncate" title={t.owner}>{t.owner}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{t.dueDate}</td>
                    <td className="px-3 py-2"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${t.color}18`, color: t.color }}>{t.status}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${t.priority === "High" ? "bg-red-50 text-red-700" : t.priority === "Medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{t.priority}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {/* ── 9. Upcoming Milestones ── */}
      <ReportSection title="9. Upcoming Milestones">
        {report.timeline.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No upcoming milestones.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[500px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <th className="w-[35%] px-3 py-2">Task</th>
                  <th className="w-[20%] px-3 py-2">Owner</th>
                  <th className="w-[18%] px-3 py-2">Due Date</th>
                  <th className="w-[15%] px-3 py-2">Status</th>
                  <th className="w-[12%] px-3 py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {report.timeline.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900 break-words" title={t.title}>{t.title}</td>
                    <td className="px-3 py-2 text-slate-600 truncate" title={t.owner}>{t.owner}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{t.dueDate}</td>
                    <td className="px-3 py-2"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${t.color}18`, color: t.color }}>{t.status}</span></td>
                    <td className="px-3 py-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: t.statusKey === "overdue" ? "100%" : t.statusKey === "near_due" ? "78%" : "52%", backgroundColor: t.color }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {/* ── 10. Detailed Task Register ── */}
      <ReportSection title="10. Detailed Task Register">
        {report.taskRegister.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No tasks in register.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <th className="px-2 py-2 w-[18%]">Task</th>
                  <th className="px-2 py-2 w-[10%]">Owner</th>
                  <th className="px-2 py-2 w-[8%]">Status</th>
                  <th className="px-2 py-2 w-[6%]">Prog</th>
                  <th className="px-2 py-2 w-[9%]">Start</th>
                  <th className="px-2 py-2 w-[9%]">Due</th>
                  <th className="px-2 py-2 w-[8%]">Time Left</th>
                  <th className="px-2 py-2 w-[5%]">Cmts</th>
                  <th className="px-2 py-2 w-[7%]">Priority</th>
                  <th className="px-2 py-2 w-[20%]">Description</th>
                </tr>
              </thead>
              <tbody>
                {report.taskRegister.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5 font-medium text-slate-900 break-words leading-tight" title={t.title}>{t.title}</td>
                    <td className="px-2 py-1.5 text-slate-600 truncate" title={t.owner}>{t.owner}</td>
                    <td className="px-2 py-1.5"><span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${t.color}18`, color: t.color }}>{t.status}</span></td>
                    <td className="px-2 py-1.5 text-slate-600 tabular-nums">{t.progress}%</td>
                    <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{t.startDate}</td>
                    <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{t.dueDate}</td>
                    <td className="px-2 py-1.5 font-semibold" style={{ color: t.color }}>{t.timeLeft}</td>
                    <td className="px-2 py-1.5 text-slate-500 tabular-nums text-center">{t.comments}</td>
                    <td className="px-2 py-1.5 text-slate-600">{t.priority}</td>
                    <td className="px-2 py-1.5 text-slate-500 break-words leading-tight">{t.description.length > 80 ? `${t.description.slice(0, 80)}…` : t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {/* ── 11. AI Recommendations ── */}
      <ReportSection title="11. AI Recommendations">
        <div className="grid gap-3 md:grid-cols-2">
          {report.recommendations.map((item, index) => (
            <div key={`ai-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 overflow-hidden">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Recommendation {index + 1}</p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-800 break-words">{item}</p>
            </div>
          ))}
        </div>
      </ReportSection>
    </div>
  );
}

function ClientExecutiveReport({ report }: { report: ExecutiveReportData }) {
  const progressSegments = [
    { label: "Completed", value: report.statusSummary.completed, color: CLIENT_STATUS_COLORS.completed },
    { label: "In Progress", value: report.statusSummary.inProgress, color: CLIENT_STATUS_COLORS.inProgress },
    { label: "In Review", value: report.statusSummary.inReview, color: CLIENT_STATUS_COLORS.inReview },
    { label: "Todo", value: report.statusSummary.todo, color: CLIENT_STATUS_COLORS.todo },
    { label: "Overdue", value: report.statusSummary.overdue, color: CLIENT_STATUS_COLORS.overdue },
  ];
  const total = Math.max(1, progressSegments.reduce((sum, segment) => sum + segment.value, 0));
  const ganttLegend = [
    ["Todo / Not Started", CLIENT_STATUS_COLORS.todo], ["In Progress", CLIENT_STATUS_COLORS.inProgress], ["In Review", CLIENT_STATUS_COLORS.inReview],
    ["Completed", CLIENT_STATUS_COLORS.completed], ["Overdue", CLIENT_STATUS_COLORS.overdue], ["Near Due", CLIENT_STATUS_COLORS.nearDue],
  ];
  const statusRows = [
    { label: "Todo", value: report.statusSummary.todo, color: CLIENT_STATUS_COLORS.todo },
    { label: "In Progress", value: report.statusSummary.inProgress, color: CLIENT_STATUS_COLORS.inProgress },
    { label: "In Review", value: report.statusSummary.inReview, color: CLIENT_STATUS_COLORS.inReview },
    { label: "Completed", value: report.statusSummary.completed, color: CLIENT_STATUS_COLORS.completed },
    { label: "Overdue", value: report.statusSummary.overdue, color: CLIENT_STATUS_COLORS.overdue },
  ];
  const leadDisplay = formatLeadDisplay(report.leads);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-[#050816] p-8 text-white shadow-lg">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Powered by</p>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">Fathom Marine Consultancy</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">Client Project Report</p>
        <h2 className="mt-6 text-3xl font-bold tracking-tight">{report.projectName}</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
          <span>Owner: <strong className="text-white">{report.leads.owner}</strong></span>
          <span>{leadDisplay.label}: <strong className="text-white">{leadDisplay.value}</strong></span>
          <span>Generated: <strong className="text-white">{formatDate(report.generatedAt)}</strong></span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Total Tasks", report.kpis.total], ["Completed", report.kpis.completed], ["In Progress", report.statusSummary.inProgress], ["Overdue", report.kpis.overdue]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/[0.07] px-3 py-2.5 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10">
          <div className="flex h-full">
            {progressSegments.filter((segment) => segment.value > 0).map((segment) => (
              <div key={segment.label} title={`${segment.label}: ${segment.value}`} style={{ width: `${segment.value / total * 100}%`, backgroundColor: segment.color }} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          {progressSegments.map((segment) => <span key={segment.label}><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: segment.color }} />{segment.label}: {segment.value}</span>)}
        </div>
      </div>

      <ReportSection title="Client Status Summary">
        <div className="grid gap-3 sm:grid-cols-5">
          {statusRows.map((row) => (
            <div key={row.label} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{row.label}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: row.color }}>{row.value}</p>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection title="Project Timeline">
        {report.gantt.tasks.length === 0 ? <div className="text-sm text-slate-400">No tasks with date ranges.</div> : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {report.gantt.tasks.map((task) => (
                <div key={task.id} className="flex items-center border-b border-slate-100 py-2">
                  <div className="w-[260px] shrink-0 break-words px-2 text-xs font-medium text-slate-900">{task.title}</div>
                  <div className="relative h-5 flex-1 bg-slate-50">
                    <div className="absolute top-1 h-3 rounded-sm" style={{ left: `${task.left}%`, width: `${Math.max(1.5, Math.min(100 - task.left, task.width))}%`, backgroundColor: clientPreviewStatusColor(task.statusKey, task.status) }} />
                  </div>
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {ganttLegend.map(([label, color]) => <span key={label}><span className="mr-1.5 inline-block h-2 w-2" style={{ backgroundColor: color }} />{label}</span>)}
              </div>
            </div>
          </div>
        )}
      </ReportSection>

      <ReportSection title="Task Register">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-xs">
            <thead className="bg-slate-50 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-400"><tr>
              <th className="w-[36%] px-3 py-2">Task Name</th><th className="w-[13%] px-3 py-2">Status</th><th className="w-[10%] px-3 py-2">Progress</th><th className="w-[14%] px-3 py-2">Start Date</th><th className="w-[14%] px-3 py-2">Due Date</th><th className="w-[13%] px-3 py-2">Time Left</th>
            </tr></thead>
            <tbody>{report.taskRegister.map((task) => <tr key={task.id} className="border-t border-slate-100 align-top">
              <td className="break-words px-3 py-2 font-medium text-slate-900">{task.title}</td><td className="px-3 py-2"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${clientPreviewStatusColor(task.statusKey, task.status)}18`, color: clientPreviewStatusColor(task.statusKey, task.status) }}>{task.status}</span></td><td className="px-3 py-2">{task.progress}%</td><td className="px-3 py-2">{task.startDate}</td><td className="px-3 py-2">{task.dueDate}</td><td className="px-3 py-2">{task.timeLeft}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </ReportSection>
    </div>
  );
}

function TaskTeamTable({ rows }: { rows: TeamContributionRow[] }) {
  if (rows.length === 0) return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No team contribution data.</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Completed</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2">Overdue</th>
            <th className="px-3 py-2">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
              <td className="px-3 py-2 text-emerald-700">{row.completed}</td>
              <td className="px-3 py-2 text-blue-700">{row.active}</td>
              <td className="px-3 py-2 text-red-700">{row.overdue}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${row.utilization}%` }} />
                  </div>
                  <span className="text-xs text-slate-600">{row.utilization}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserList({ rows, emptyLabel }: { rows: TeamContributionRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">{emptyLabel}</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.userId} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <span className="text-sm font-medium text-slate-800">{row.name}</span>
          <span className="text-xs font-semibold text-slate-500">{row.utilization}%</span>
        </div>
      ))}
    </div>
  );
}

function UserPerformanceReport({ report }: { report: UserPerformanceReportData }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#2d1460]/20 bg-[#24124d] p-5 text-white shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200">User Performance Report</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{report.userName}</h2>
            <p className="mt-1 text-sm text-violet-100">{report.projectName}</p>
          </div>
          <p className="text-xs text-violet-200">Generated {formatDate(report.generatedAt)}</p>
        </div>
      </div>

      <ReportSection title="1. Executive Summary">
        <div className="grid gap-3 md:grid-cols-5">
          <MiniMetric label="Completion" value={`${report.summary.completionRate}%`} tone="green" />
          <MiniMetric label="Active Tasks" value={report.summary.activeTasks} tone="blue" />
          <MiniMetric label="Overdue" value={report.summary.overdueTasks} tone={report.summary.overdueTasks ? "red" : "green"} />
          <MiniMetric label="Near Due" value={report.summary.nearDueTasks} tone="amber" />
          <MiniMetric label="Assignments" value={report.summary.totalAssignments} />
        </div>
      </ReportSection>

      <ReportSection title="2. Work History">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Assigned Date</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2">Completed Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.workHistory.map((task) => (
                <tr key={task.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{task.title}</td>
                  <td className="px-3 py-2 text-slate-600">{task.assignedDate}</td>
                  <td className="px-3 py-2 text-slate-600">{task.dueDate}</td>
                  <td className="px-3 py-2 text-slate-600">{task.completedDate}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${task.color}18`, color: task.color }}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
              {report.workHistory.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-400">No assignments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ReportSection>

      <ReportSection title="3. Current Responsibilities">
        <div className="grid gap-4 lg:grid-cols-3">
          <TaskTable tasks={report.responsibilities.active} emptyLabel="No active tasks" />
          <TaskTable tasks={report.responsibilities.nearDue} emptyLabel="No near due tasks" />
          <TaskTable tasks={report.responsibilities.overdue} emptyLabel="No overdue tasks" />
        </div>
      </ReportSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="4. Contribution Metrics">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Completed" value={report.contribution.completedTasks} tone="green" />
            <MiniMetric label="Comments" value={report.contribution.commentsAdded} tone="blue" />
            <MiniMetric label="Activity Count" value={report.contribution.activityCount} />
            <MiniMetric label="Assignments" value={report.contribution.assignmentsHandled} />
          </div>
        </ReportSection>

        <ReportSection title="5. Workload Analysis">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Utilization" value={`${report.workload.utilizationScore}%`} tone={report.workload.utilizationScore >= 85 ? "red" : "blue"} />
            <MiniMetric label="Task Volume" value={report.workload.taskVolume} />
          </div>
          <ul className="mt-4 space-y-2">
            {report.workload.bottlenecks.map((item) => (
              <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{item}</li>
            ))}
          </ul>
        </ReportSection>
      </div>

      <ReportSection title="6. Comments & Live Chat Activity">
        <div className="space-y-2">
          {report.recentComments.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{formatReportDate(item.createdAt)}</span>
                <span className="text-xs font-semibold text-slate-700">{item.taskName}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 break-words">{item.detail}</p>
            </div>
          ))}
          {report.recentComments.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No recent comments from this user.</div>}
        </div>
      </ReportSection>

      <ReportSection title="7. Activity Timeline">
        <div className="space-y-2">
          {report.activityTimeline.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-lg border border-slate-200 px-3 py-2 md:grid-cols-[130px_120px_1fr]">
              <span className="text-xs font-semibold text-slate-500">{formatReportDate(item.createdAt)}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{item.type}</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.taskName}</p>
                <p className="text-xs text-slate-500">{item.detail}</p>
              </div>
            </div>
          ))}
          {report.activityTimeline.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">No recent activity.</div>}
        </div>
      </ReportSection>

      <ReportSection title="8. AI Assessment">
        <div className="grid gap-4 lg:grid-cols-3">
          <AssessmentList title="Strengths" items={report.assessment.strengths} />
          <AssessmentList title="Concerns" items={report.assessment.concerns} />
          <AssessmentList title="Recommendations" items={report.assessment.recommendations} />
        </div>
      </ReportSection>
    </div>
  );
}

function AssessmentList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{item}</div>
        ))}
      </div>
    </div>
  );
}

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
  const [projectMembers, setProjectMembers] = useState<{ project_id: string; user_id: string; role?: string | null }[]>([]);

  // Activity feed
  const [comments, setComments] = useState<EnrichedComment[]>([]);

  // AI report
  const [aiReport, setAiReport] = useState<GeneratedAiReport | null>(null);
  const [aiReportType, setAiReportType] = useState<"user" | "project">("user");
  const [reportAudience, setReportAudience] = useState<"internal" | "client">("internal");
  const [aiReportError, setAiReportError] = useState<string | null>(null);
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
          .select("id, status, assigned_to, start_date, end_date, created_at, updated_at, completed_at, project_id, title, description")
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
          .select("project_id, user_id, role")
          .in("project_id", projectIds),
      ]);

      const allTasks = (tasksRes.data ?? []) as (AnalyticsTask & { project_id?: string; title?: string })[];
      setTasks(allTasks);
      setLogs((logsRes.data ?? []) as (AnalyticsLog & { task_id?: string })[]);
      setAssignees((assigneesRes.data ?? []) as AnalyticsAssignee[]);
      const allUsers = (usersRes.data ?? []) as AnalyticsUser[];
      setUsers(allUsers);
      setProjectMembers((pmRes.data ?? []) as { project_id: string; user_id: string; role?: string | null }[]);

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
    setAiReportError(null);

    try {
      const projectName = aiProjectFilter === "all"
        ? "All Projects"
        : allProjects.find((p) => p.id === aiProjectFilter)?.name ?? "Unknown";

      let aiTasks = tasks as ReportTaskWithDetails[];
      if (aiProjectFilter !== "all") {
        aiTasks = aiTasks.filter((t: any) => t.project_id === aiProjectFilter);
      }

      if (aiReportType === "user") {
        if (aiProjectFilter === "all" || aiUserFilter === "all") {
          setAiReportError("Select a project and user to generate a User Performance Report.");
          return;
        }

        const selectedUser = users.find((u) => u.id === aiUserFilter) ?? null;
        const userName = selectedUser?.name ?? selectedUser?.email ?? "Unknown user";
        const assignedTaskIds = new Set(assignees.filter((item) => item.user_id === aiUserFilter).map((item) => item.task_id));
        const userTasks = aiTasks.filter((task) => task.assigned_to === aiUserFilter || assignedTaskIds.has(task.id));
        const projectsById = new Map(allProjects.map((p) => [p.id, p]));
        const reportUsersById = new Map(users.map((u) => [u.id, u]));
        const userTaskItems = userTasks.map((task) => toReportTaskItem(task, reportUsersById, projectsById));
        const userReportKpis = computeReportKPIs(userTasks as ReportTask[]);
        const activeItems = userTaskItems.filter((task) => task.statusKey !== "completed" && task.statusKey !== "done_early");
        const nearDueItems = userTaskItems.filter((task) => task.statusKey === "near_due");
        const overdueItems = userTaskItems.filter((task) => task.statusKey === "overdue");
        const completedItems = userTaskItems.filter((task) => task.statusKey === "completed" || task.statusKey === "done_early");
        const projectTaskIds = new Set(aiTasks.map((task) => task.id));
        const userComments = comments.filter((comment) => comment.userId === aiUserFilter && projectTaskIds.has(comment.taskId));
        const userLogs = (logs as (AnalyticsLog & { task_id?: string })[]).filter((log) => log.user_id === aiUserFilter && (!log.task_id || projectTaskIds.has(log.task_id)));
        const recentComments: UserActivityItem[] = userComments.map((comment) => ({
          id: `comment-${comment.id}`,
          type: "comment",
          detail: comment.content,
          taskName: comment.taskName,
          createdAt: comment.createdAt,
        }));
        const activityTimeline: UserActivityItem[] = [
          ...userLogs.map((log) => {
            const task = aiTasks.find((item) => item.id === log.task_id);
            return {
              id: `log-${log.id}`,
              type: log.action === "moved" && log.to_status === "done" ? "completion" : log.action,
              detail: log.action === "moved" ? `${friendlyStatus(log.from_status)} -> ${friendlyStatus(log.to_status)}` : friendlyStatus(log.action),
              taskName: task?.title ?? "Unknown task",
              createdAt: log.created_at,
            };
          }),
          ...userComments.map((comment) => ({
            id: `comment-${comment.id}`,
            type: "comment",
            detail: comment.content,
            taskName: comment.taskName,
            createdAt: comment.createdAt,
          })),
        ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 24);
        const workloadRows = computeWorkload(aiTasks, assignees, users);
        const maxWorkload = Math.max(1, ...workloadRows.map((row) => row.total));
        const userWorkload = workloadRows.find((row) => row.userId === aiUserFilter);
        const utilizationScore = clampScore(((userWorkload?.total ?? userTasks.length) / maxWorkload) * 100);
        const bottlenecks = [
          overdueItems.length > 0 ? `${overdueItems.length} overdue task ownership item${overdueItems.length === 1 ? "" : "s"}.` : null,
          nearDueItems.length > 0 ? `${nearDueItems.length} near-due task${nearDueItems.length === 1 ? "" : "s"} require checkpointing.` : null,
          utilizationScore >= 85 ? "High utilization may create delivery bottlenecks." : null,
          activeItems.length === 0 ? "No active responsibilities currently assigned." : null,
        ].filter((item): item is string => Boolean(item));
        const fallbackAssessment = {
          strengths: [
            completedItems.length > 0 ? `Completed ${completedItems.length} assigned task${completedItems.length === 1 ? "" : "s"}.` : "Maintains visible assignment coverage.",
            userComments.length > 0 ? `Contributed ${userComments.length} live update${userComments.length === 1 ? "" : "s"}.` : "No comment volume risk detected from available data.",
          ],
          concerns: [
            overdueItems.length > 0 ? "Overdue ownership needs executive attention." : "No overdue ownership detected.",
            utilizationScore >= 85 ? "Workload concentration is high." : "Workload is within manageable range.",
          ],
          recommendations: buildFallbackRecommendations({
            overdueCount: overdueItems.length,
            nearDueCount: nearDueItems.length,
            staleCount: 0,
            overloadedUsers: utilizationScore >= 85 ? 1 : 0,
            completionRate: userReportKpis.completionRate,
          }),
        };
        let assessment = fallbackAssessment;

        try {
          const prompt = `Generate a user performance assessment for a PMO report. Return sections named Strengths, Concerns, Recommendations with concise bullet points only.
User: ${userName}
Project: ${projectName}
Completion: ${userReportKpis.completionRate}%
Active tasks: ${activeItems.length}
Overdue tasks: ${overdueItems.length}
Near due tasks: ${nearDueItems.length}
Comments added: ${userComments.length}
Utilization: ${utilizationScore}%`;
          const res = await fetch("/api/ai/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = await res.json();
          if (typeof data?.content === "string") {
            const parsed = parseAiRecommendationText(data.content);
            if (parsed.length > 0) {
              assessment = {
                strengths: parsed.slice(0, 2).length ? parsed.slice(0, 2) : fallbackAssessment.strengths,
                concerns: parsed.slice(2, 4).length ? parsed.slice(2, 4) : fallbackAssessment.concerns,
                recommendations: parsed.slice(4, 7).length ? parsed.slice(4, 7) : fallbackAssessment.recommendations,
              };
            }
          }
        } catch (assessmentError) {
          console.warn("AI user assessment unavailable", assessmentError);
        }

        setAiReport({
          type: "user",
          data: {
            userName,
            projectName,
            generatedAt: new Date().toISOString(),
            summary: {
              completionRate: userReportKpis.completionRate,
              activeTasks: activeItems.length,
              overdueTasks: overdueItems.length,
              nearDueTasks: nearDueItems.length,
              totalAssignments: userTasks.length,
            },
            workHistory: userTasks.map((task) => ({
              ...toReportTaskItem(task, reportUsersById, projectsById),
              assignedDate: formatReportDate(task.created_at),
              completedDate: formatReportDate(task.completed_at),
            })),
            responsibilities: {
              active: activeItems,
              nearDue: nearDueItems,
              overdue: overdueItems,
            },
            contribution: {
              completedTasks: completedItems.length,
              commentsAdded: userComments.length,
              activityCount: activityTimeline.length,
              assignmentsHandled: userTasks.length,
            },
            recentComments,
            activityTimeline,
            workload: {
              utilizationScore,
              taskVolume: userTasks.length,
              bottlenecks: bottlenecks.length ? bottlenecks : ["No major workload bottlenecks detected from available data."],
            },
            assessment,
          },
        });
        return;
      }

      const aiReportKpis = computeReportKPIs(aiTasks as ReportTask[]);
      const aiStatusDist = computeReportStatusDistribution(aiTasks as ReportTask[]);
      const projectsById = new Map(allProjects.map((p) => [p.id, p]));
      const reportUsersById = new Map(users.map((u) => [u.id, u]));
      const taskItems = aiTasks.map((task) => toReportTaskItem(task, reportUsersById, projectsById));
      const statusSummary = aiTasks.reduce((summary, task) => {
        const reportStatus = deriveReportStatus(task as ReportTask);
        if (reportStatus === "overdue") summary.overdue += 1;
        else if (reportStatus === "completed" || reportStatus === "done_early") summary.completed += 1;
        else if (normalizeStatus(task.status) === "in_review") summary.inReview += 1;
        else if (reportStatus === "in_progress" || reportStatus === "near_due") summary.inProgress += 1;
        else summary.todo += 1;
        return summary;
      }, { todo: 0, inProgress: 0, inReview: 0, completed: 0, overdue: 0 });
      const gantt = buildGanttPdfData(aiTasks, reportUsersById, projectsById);
      const overdueItems = taskItems.filter((task) => task.statusKey === "overdue");
      const nearDueItems = taskItems.filter((task) => task.statusKey === "near_due");
      const staleItems = aiTasks.filter(isStaleReportTask).map((task) => toReportTaskItem(task, reportUsersById, projectsById));
      const inactiveItems = aiTasks.filter(isInactiveReportTask).map((task) => toReportTaskItem(task, reportUsersById, projectsById));
      const completedItems = taskItems.filter((task) => task.statusKey === "completed" || task.statusKey === "done_early");
      const inProgressItems = taskItems.filter((task) => task.statusKey === "in_progress");
      const upcomingItems = taskItems
        .filter((task) => task.statusKey === "not_started" || task.statusKey === "near_due")
        .filter((task) => task.statusKey !== "overdue");
      const taskRegister: DetailedTaskRegisterItem[] = aiTasks.map((task) => {
        const statusKey = deriveReportStatus(task as ReportTask);
        return {
          ...toReportTaskItem(task, reportUsersById, projectsById),
          progress: getDocumentProgress(statusKey),
          startDate: formatReportDate(task.start_date ?? task.created_at),
          timeLeft: getDocumentTimeLeft(task as ReportTask, statusKey),
          comments: commentCounts[task.id] ?? 0,
          description: task.description?.trim() || "No description provided.",
          priority: getTaskPriority(statusKey),
        };
      });

      const workloadRows = computeWorkload(aiTasks, assignees, users);
      const maxWorkload = Math.max(1, ...workloadRows.map((row) => row.total));
      const teamRows: TeamContributionRow[] = workloadRows.map((row) => ({
        userId: row.userId,
        name: row.name,
        completed: row.completed,
        active: Math.max(0, row.total - row.completed),
        overdue: row.overdue,
        total: row.total,
        utilization: clampScore((row.total / maxWorkload) * 100),
      }));
      const averageUtilization = teamRows.length
        ? clampScore(teamRows.reduce((sum, row) => sum + row.utilization, 0) / teamRows.length)
        : 0;
      const overloaded = teamRows.filter((row) => row.utilization >= 85 && row.active > 0);
      const underutilized = teamRows.filter((row) => row.utilization <= 35);
      const riskLevel = getRiskLevel(overdueItems.length, nearDueItems.length, staleItems.length);
      const healthScore = clampScore(
        100 - overdueItems.length * 12 - nearDueItems.length * 5 - staleItems.length * 4 + aiReportKpis.completionRate * 0.25,
      );
      const progressScore = clampScore(aiReportKpis.completionRate);
      const healthLabel = riskLevel === "High" ? "At Risk" : riskLevel === "Medium" ? "Watch" : "Healthy";
      const leads = aiProjectFilter === "all"
        ? {
          owner: "Portfolio view",
          primaryLead: teamRows[0]?.name ?? "Not assigned",
          supportingLeads: teamRows.slice(1, 4).map((row) => row.name),
          leadNames: teamRows.slice(0, 4).map((row) => row.name),
        }
        : getProjectLeadInfo(aiProjectFilter, projectMembers, reportUsersById, teamRows);
      const actionItems = taskRegister.filter((task) => task.statusKey !== "completed" && task.statusKey !== "done_early");

      let recommendations = reportAudience === "client" ? [] : buildFallbackRecommendations({
        overdueCount: overdueItems.length,
        nearDueCount: nearDueItems.length,
        staleCount: staleItems.length,
        overloadedUsers: overloaded.length,
        completionRate: aiReportKpis.completionRate,
      });

      if (reportAudience === "internal") {
        try {
          const selectedUser = aiUserFilter !== "all" ? users.find((u) => u.id === aiUserFilter) : null;
          const reportPrompt = `Generate PMO executive recommendations only. Return 5 concise bullet recommendations, no introduction.
Project: ${projectName}
Focus user: ${selectedUser?.name ?? "All users"}
Completion: ${aiReportKpis.completionRate}%
Overdue tasks: ${overdueItems.length}
Near due tasks: ${nearDueItems.length}
Stale tasks: ${staleItems.length}
Overloaded users: ${overloaded.map((u) => u.name).join(", ") || "None"}
Top overdue: ${overdueItems.slice(0, 5).map((task) => `${task.title} (${task.owner})`).join("; ") || "None"}`;

          const res = await fetch("/api/ai/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: reportPrompt }),
          });
          const data = await res.json();
          if (typeof data?.content === "string") {
            const parsed = parseAiRecommendationText(data.content);
            if (parsed.length > 0) {
              recommendations = parsed;
            }
          }
        } catch (recommendationError) {
          console.warn("AI recommendations unavailable", recommendationError);
        }
      }

      setAiReport({
        type: "project",
        audience: reportAudience,
        data: {
          audience: reportAudience,
          projectName,
          generatedAt: new Date().toISOString(),
          leads,
          health: {
            label: healthLabel,
            riskLevel,
            healthScore,
            progressScore,
            completionRate: aiReportKpis.completionRate,
            overdueCount: overdueItems.length,
          },
          kpis: {
            total: aiReportKpis.total,
            completed: aiReportKpis.completed + aiReportKpis.doneEarly,
            inProgress: aiReportKpis.inProgress,
            nearDue: aiReportKpis.nearDue,
            overdue: aiReportKpis.overdue,
          },
          statusDistribution: aiStatusDist,
          statusSummary,
          gantt,
          timeline: taskItems
            .filter((task) => task.statusKey === "overdue" || task.statusKey === "near_due" || task.statusKey === "in_progress"),
          team: teamRows,
          resource: {
            averageUtilization,
            overloaded,
            underutilized,
          },
          risks: {
            overdue: overdueItems,
            nearDue: nearDueItems,
            stale: staleItems,
            inactive: inactiveItems,
          },
          actions: actionItems,
          breakdown: {
            completed: completedItems,
            inProgress: inProgressItems,
            overdue: overdueItems,
            upcoming: upcomingItems,
          },
          taskRegister,
          recommendations,
        },
      });
    } catch (err) {
      console.error("AI report error", err);
      setAiReport(null);
    } finally {
      setIsGeneratingAi(false);
    }
  }, [profile?.id, aiProjectFilter, aiUserFilter, aiReportType, reportAudience, allProjects, tasks, users, assignees, comments, logs, commentCounts, projectMembers]);

  const exportAiReportPdf = useCallback(async () => {
    if (!aiReport) {
      setAiReportError("Generate a report before exporting PDF.");
      return;
    }

    setAiReportError(null);
    try {
      const response = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiReport),
      });

      if (!response.ok) {
        throw new Error("PDF export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = aiReport.type === "project" ? "executive-report.pdf" : "user-performance-report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error("PDF export error", exportError);
      setAiReportError("Could not export PDF. Please try again.");
    }
  }, [aiReport]);

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
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${active
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
                      {overdueTasks.map((t: any) => (
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
              <div className="overflow-hidden rounded-2xl border border-[#2d1460]/20 bg-white shadow-sm">
                <div className="bg-[#24124d] px-5 py-4 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200">AI Reporting System V2</p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">PMO Report Builder</h2>
                </div>
                <div className="grid gap-4 p-5 xl:grid-cols-[240px_1fr]">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Report Type</p>
                    <div className="grid gap-2">
                      {[
                        { id: "user", label: "User Performance" },
                        { id: "project", label: "Project Executive" },
                      ].map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setAiReportType(type.id as "user" | "project");
                            setAiReport(null);
                            setAiReportError(null);
                          }}
                          className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${aiReportType === type.id
                              ? "border-[#381a78] bg-[#381a78] text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px] flex-1">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Project</label>
                      <select value={aiProjectFilter} onChange={(e) => { setAiProjectFilter(e.target.value); setAiReport(null); setAiReportError(null); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#381a78]">
                        <option value="all">{aiReportType === "user" ? "Select Project" : "All Projects"}</option>
                        {allProjects.map((p) => <option key={p.id} value={p.id}>{p.name ?? "Unknown"}</option>)}
                      </select>
                    </div>
                    {aiReportType === "user" && (
                      <div className="min-w-[220px] flex-1">
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</label>
                        <select value={aiUserFilter} onChange={(e) => { setAiUserFilter(e.target.value); setAiReport(null); setAiReportError(null); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#381a78]">
                          <option value="all">Select User</option>
                          {filteredAiUsers.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email ?? "Unknown"}</option>)}
                        </select>
                      </div>
                    )}
                    {aiReportType === "project" && (
                      <div className="shrink-0">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Audience</p>
                        <div className="inline-flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1">
                          {([['internal', 'Team'], ['client', 'Client']] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => { setReportAudience(value); setAiReport(null); setAiReportError(null); }}
                              className={`rounded-md px-3 text-xs font-semibold transition ${reportAudience === value ? "bg-[#381a78] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void generateAiReport()}
                      disabled={isGeneratingAi}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2d1460] px-5 text-sm font-medium text-white transition hover:bg-[#381a78] disabled:opacity-50"
                    >
                      {isGeneratingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {isGeneratingAi ? "Generating..." : "Generate Report"}
                    </button>
                    <button
                      type="button"
                      onClick={exportAiReportPdf}
                      disabled={!aiReport}
                      className="flex h-10 items-center justify-center rounded-xl border border-[#2d1460]/30 bg-white px-5 text-sm font-semibold text-[#2d1460] transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
                {aiReportError && <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{aiReportError}</div>}
              </div>


              {aiReport && (
                aiReport.type === "project" ? <ExecutiveReport report={aiReport.data} /> : <UserPerformanceReport report={aiReport.data} />
              )}
            </div>
          )}
        </>
      )}
      {renderTaskDetails()}
    </div>
  );
}
