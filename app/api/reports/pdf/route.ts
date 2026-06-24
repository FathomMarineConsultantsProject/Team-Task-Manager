export const runtime = "nodejs";

type ReportStatusKey = "not_started" | "in_progress" | "near_due" | "done_early" | "completed" | "overdue";

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

type TeamContributionRow = {
  userId: string;
  name: string;
  completed: number;
  active: number;
  overdue: number;
  total: number;
  utilization: number;
};

type DetailedTaskRegisterItem = ReportTaskItem & {
  progress: number;
  startDate: string;
  timeLeft: string;
  comments: number;
  description: string;
  priority: string;
};

type ProjectLeadInfo = {
  owner: string;
  primaryLead: string;
  supportingLeads: string[];
  leadNames?: string[];
};

type ExecutiveReportData = {
  audience?: "internal" | "client";
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
  | { type: "project"; audience?: "internal" | "client"; data: ExecutiveReportData }
  | { type: "user"; data: UserPerformanceReportData };

const PAGE_W = 842;
const PAGE_H = 595;
const M = 32;
const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  border: "#d8d5ea",
  page: "#f6f5fb",
  dark: "#050816",
  panel: "#ffffff",
  purple: "#6c4ff6",
  blue: "#2563eb",
  green: "#16a34a",
  lightGreen: "#86efac",
  orange: "#f59e0b",
  red: "#ef4444",
};

const CLIENT_STATUS_COLORS = {
  todo: "#6D4AF2",
  inProgress: "#00B8D9",
  inReview: "#F59E0B",
  completed: "#16A34A",
  overdue: "#EF4444",
  nearDue: "#F97316",
};

const BRAND_NAME = "Fathhom Marine Consultants";
const BRAND_NAME_UPPER = "FATHHOM MARINE CONSULTANTS";

type ProjectManagerRecommendation = {
  title: string;
  color: string;
  bullets: string[];
};

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfText(value: unknown) {
  return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function rgb(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : COLORS.ink;
  const n = Number.parseInt(safe.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function statusColor(status: ReportStatusKey | string) {
  if (status === "not_started") return COLORS.purple;
  if (status === "in_progress") return COLORS.blue;
  if (status === "near_due") return COLORS.orange;
  if (status === "done_early") return COLORS.lightGreen;
  if (status === "completed") return COLORS.green;
  if (status === "overdue") return COLORS.red;
  return COLORS.muted;
}

function clientStatusColor(statusKey: ReportStatusKey | string, statusLabel?: string) {
  const normalizedLabel = clean(statusLabel).toLowerCase();
  if (statusKey === "not_started") return CLIENT_STATUS_COLORS.todo;
  if (statusKey === "in_progress") {
    return normalizedLabel.includes("review") ? CLIENT_STATUS_COLORS.inReview : CLIENT_STATUS_COLORS.inProgress;
  }
  if (statusKey === "near_due") return CLIENT_STATUS_COLORS.nearDue;
  if (statusKey === "done_early" || statusKey === "completed") return CLIENT_STATUS_COLORS.completed;
  if (statusKey === "overdue") return CLIENT_STATUS_COLORS.overdue;
  if (statusKey === "in_review" || normalizedLabel.includes("review")) return CLIENT_STATUS_COLORS.inReview;
  return COLORS.muted;
}

function wrap(value: unknown, maxChars: number, maxLines = 2) {
  const words = clean(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [""];
}

function getLeadNames(leads: ProjectLeadInfo) {
  const names = leads.leadNames?.length
    ? leads.leadNames
    : [leads.primaryLead, ...leads.supportingLeads].filter((name) => name && name !== "Not assigned" && name !== "None listed");
  return Array.from(new Set(names));
}

function formatLeadLine(leads: ProjectLeadInfo, maxChars = 82) {
  const names = getLeadNames(leads);
  const label = names.length > 1 ? "Leads" : "Lead";

  if (names.length === 0) {
    return `${label}: Not assigned`;
  }

  for (let count = names.length; count >= 1; count -= 1) {
    const suffix = count < names.length ? ` + ${names.length - count} more` : "";
    const line = `${label}: ${names.slice(0, count).join(", ")}${suffix}`;
    if (line.length <= maxChars || count === 1) {
      return line;
    }
  }

  return `${label}: ${names[0]}`;
}

class Canvas {
  private commands: string[] = [];

  rect(x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
    const [r, g, b] = rgb(fill);
    this.commands.push(`${r} ${g} ${b} rg ${x} ${PAGE_H - y - h} ${w} ${h} re f`);
    if (stroke) {
      const [sr, sg, sb] = rgb(stroke);
      this.commands.push(`${sr} ${sg} ${sb} RG ${x} ${PAGE_H - y - h} ${w} ${h} re S`);
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1) {
    const [r, g, b] = rgb(color);
    this.commands.push(`${r} ${g} ${b} RG ${width} w ${x1} ${PAGE_H - y1} m ${x2} ${PAGE_H - y2} l S`);
  }

  polygon(points: Array<{ x: number; y: number }>, fill: string) {
    if (points.length < 3) return;
    const [r, g, b] = rgb(fill);
    const [first, ...rest] = points;
    const path = [
      `${first.x} ${PAGE_H - first.y} m`,
      ...rest.map((point) => `${point.x} ${PAGE_H - point.y} l`),
      "h",
      "f",
    ].join(" ");
    this.commands.push(`${r} ${g} ${b} rg ${path}`);
  }

  text(value: unknown, x: number, y: number, size = 11, color = COLORS.ink, bold = false) {
    const [r, g, b] = rgb(color);
    const font = bold ? "F2" : "F1";
    this.commands.push(`BT /${font} ${size} Tf ${r} ${g} ${b} rg ${x} ${PAGE_H - y - size} Td (${pdfText(value)}) Tj ET`);
  }

  centeredText(value: unknown, x: number, y: number, w: number, h: number, size = 11, color = COLORS.ink, bold = false) {
    const text = clean(value);
    const estimatedWidth = text.length * size * 0.56;
    this.text(text, x + Math.max(0, (w - estimatedWidth) / 2), y + Math.max(0, (h - size) / 2), size, color, bold);
  }

  textLines(lines: string[], x: number, y: number, size = 10, color = COLORS.ink, bold = false, leading = size + 4) {
    lines.forEach((line, index) => this.text(line, x, y + index * leading, size, color, bold));
  }

  bar(x: number, y: number, w: number, h: number, pct: number, color: string) {
    this.rect(x, y, w, h, "#e5e7eb");
    this.rect(x, y, clamp(pct) * w / 100, h, color);
  }

  out() {
    return this.commands.join("\n");
  }
}

type PageDraw = (canvas: Canvas, pageNo: number, pageCount: number) => void;

class PdfDoc {
  private pages: PageDraw[] = [];

  addPage(draw: PageDraw) {
    this.pages.push(draw);
  }

  build() {
    const objects: string[] = [];
    const kids: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

    this.pages.forEach((draw, index) => {
      const contentId = 5 + index * 2;
      const pageId = contentId + 1;
      const canvas = new Canvas();
      draw(canvas, index + 1, this.pages.length);
      const stream = canvas.out();
      objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      kids.push(`${pageId} 0 R`);
    });

    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${this.pages.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = Buffer.byteLength(pdf, "utf8");
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) {
      pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }
}

function footer(c: Canvas, reportDate: string, pageNo: number, pageCount: number) {
  c.line(M, 562, PAGE_W - M, 562, COLORS.border);
  c.text(`Powered by ${BRAND_NAME}`, M, 569, 10, COLORS.muted, true);
  c.text(`Generated ${formatDate(reportDate)}`, 342, 569, 10, COLORS.muted);
  c.text(`Page ${pageNo} of ${pageCount}`, PAGE_W - 96, 569, 10, COLORS.muted, true);
}

function sectionHeader(c: Canvas, title: string, y = 24) {
  const h = 38;
  const size = 20;
  const textY = y + (h - size) / 2;
  c.rect(M, y, PAGE_W - M * 2, h, COLORS.dark);
  c.text(title.toUpperCase(), M + 14, textY, size, "#ffffff", true);
}

function userSectionHeader(c: Canvas, title: string, y = 24) {
  c.rect(M, y, PAGE_W - M * 2, 38, COLORS.dark);
  c.text(title.toUpperCase(), M + 14, y + 10, 20, "#ffffff", true);
}

function kpi(c: Canvas, x: number, y: number, w: number, label: string, value: string | number, color: string) {
  c.rect(x, y, w, 70, COLORS.panel, "#d9d5f5");
  c.rect(x, y, 6, 70, color);
  c.text(label.toUpperCase(), x + 16, y + 12, 8, COLORS.muted, true);
  c.text(value, x + 16, y + 32, 22, color, true);
}

function miniTable(c: Canvas, x: number, y: number, widths: number[], headers: string[], rows: unknown[][], rowH = 24) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  c.rect(x, y, total, rowH, "#24124d");
  let cursor = x;
  headers.forEach((header, index) => {
    c.text(header.toUpperCase(), cursor + 5, y + 8, 9, "#ffffff", true);
    cursor += widths[index];
  });
  rows.forEach((row, rowIndex) => {
    const top = y + rowH * (rowIndex + 1);
    c.rect(x, top, total, rowH, rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc", COLORS.border);
    cursor = x;
    row.forEach((cell, index) => {
      c.textLines(wrap(cell, Math.max(8, Math.floor(widths[index] / 6)), 2), cursor + 5, top + 6, 10, COLORS.ink);
      cursor += widths[index];
    });
  });
}

function wrapCell(value: unknown, maxChars: number, maxLines = 2) {
  const text = clean(value).replace(/https?:\/\/\S{24,}/gi, "Link attached");
  const words = text.split(" ").filter(Boolean).flatMap((word) => {
    if (word.length <= maxChars) return [word];
    const chunks: string[] = [];
    for (let index = 0; index < word.length; index += maxChars) {
      chunks.push(word.slice(index, index + maxChars));
    }
    return chunks;
  });
  const lines: string[] = [];
  let line = "";
  let truncated = false;

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    } else {
      line = next;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === 0) lines.push("");
  if (truncated || words.join(" ").length > lines.join(" ").length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
  }
  return lines;
}

function miniTableDynamicRows(c: Canvas, x: number, y: number, widths: number[], headers: string[], rows: unknown[][], baseRowH = 28, maxBottom = 540) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  c.rect(x, y, total, baseRowH, "#24124d");
  let cursor = x;
  headers.forEach((header, index) => {
    c.text(header.toUpperCase(), cursor + 5, y + 8, 9, "#ffffff", true);
    cursor += widths[index];
  });

  let top = y + baseRowH;
  rows.forEach((row, rowIndex) => {
    const wrapped = row.map((cell, index) => wrapCell(cell, Math.max(8, Math.floor(widths[index] / 6)), 2));
    const maxLines = Math.max(...wrapped.map((lines) => lines.length), 1);
    const computedRowH = Math.max(baseRowH, maxLines * 12 + 14);
    if (top + computedRowH > maxBottom) return;

    c.rect(x, top, total, computedRowH, rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc", COLORS.border);
    cursor = x;
    wrapped.forEach((lines, index) => {
      c.textLines(lines, cursor + 5, top + 7, 9, COLORS.ink, false, 11);
      cursor += widths[index];
    });
    top += computedRowH;
  });
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length || index === 0; index += size) {
    chunks.push(items.slice(index, index + size));
    if (items.length === 0) break;
  }
  return chunks;
}

function monthTicks(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const span = Math.max(1, end.getTime() - start.getTime());
  const ticks: { label: string; left: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const segmentStart = Math.max(start.getTime(), monthStart.getTime());
    const segmentEnd = Math.min(end.getTime(), monthEnd.getTime());
    const center = segmentStart + (segmentEnd - segmentStart) / 2;
    ticks.push({
      label: cursor.toLocaleDateString("en-US", { month: "short" }),
      left: clamp(((center - start.getTime()) / span) * 100),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (ticks.length === 0) {
    ticks.push({ label: start.toLocaleDateString("en-US", { month: "short" }), left: 0 });
    ticks.push({ label: end.toLocaleDateString("en-US", { month: "short" }), left: 100 });
  }
  return ticks;
}

function dateTicks(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const span = Math.max(1, end.getTime() - start.getTime());
  const ticks: { label: string; left: number }[] = [
    {
      label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      left: 0,
    },
  ];
  const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (cursor < end) {
    ticks.push({
      label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      left: clamp(((cursor.getTime() - start.getTime()) / span) * 100),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  ticks.push({
    label: end.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    left: 100,
  });
  return ticks;
}

function panel(c: Canvas, x: number, y: number, w: number, h: number, title: string) {
  c.rect(x, y, w, h, COLORS.panel, COLORS.border);
  c.rect(x, y, w, 26, "#24124d");
  c.text(title.toUpperCase(), x + 10, y + 8, 9, "#ffffff", true);
}

function bars(c: Canvas, x: number, y: number, w: number, rows: { label: string; value: number; color: string }[], maxValue?: number) {
  const max = Math.max(1, maxValue ?? Math.max(...rows.map((row) => row.value), 1));
  rows.forEach((row, index) => {
    const top = y + index * 28;
    c.text(wrap(row.label, 22, 1)[0], x, top, 8.5, COLORS.ink, true);
    c.text(row.value, x + w - 24, top, 8.5, COLORS.muted, true);
    c.bar(x, top + 13, w, 8, row.value / max * 100, row.color);
  });
}

function statusText(task: ReportTaskItem) {
  return `${task.status}${task.projectName ? ` / ${task.projectName}` : ""}`;
}

function buildClientRecommendationCards(report: ExecutiveReportData): ProjectManagerRecommendation[] {
  const activeCount = Math.max(0, report.kpis.total - report.kpis.completed);
  const inProgressCount = report.statusSummary?.inProgress ?? report.kpis.inProgress;
  const nearDueCount = report.kpis.nearDue;
  const overdueCount = report.kpis.overdue;
  const completedCount = report.kpis.completed;
  const completionRate = report.health.completionRate;
  const missingDateCount = report.taskRegister.filter((task) => task.dueDate === "--" || task.dueDate === "Invalid Date").length;
  const longDurationCount = report.gantt.tasks.filter((task) => {
    const start = new Date(task.startValue ?? "").getTime();
    const end = new Date(task.endValue ?? "").getTime();
    return !Number.isNaN(start) && !Number.isNaN(end) && end - start >= 14 * 86400000;
  }).length;
  const upcomingCount = report.timeline.length;

  const deliveryFocus: string[] = [];
  if (inProgressCount > 0) {
    deliveryFocus.push(`Complete the ${inProgressCount} active in-progress ${inProgressCount === 1 ? "deliverable" : "deliverables"} before expanding new workstreams, with the most advanced items closed first.`);
  } else {
    deliveryFocus.push(`Maintain delivery momentum by keeping completed work validated and any remaining open items visible in the task register.`);
  }
  deliveryFocus.push(`${completedCount} of ${report.kpis.total} tracked ${report.kpis.total === 1 ? "deliverable is" : "deliverables are"} complete, with ${activeCount} still requiring follow-through to protect the delivery plan.`);
  deliveryFocus.push(`Use the ${completionRate}% completion position to focus the next review on closing measurable deliverables rather than adding unplanned scope.`);

  const priorityActions: string[] = [];
  if (nearDueCount > 0) {
    priorityActions.push(`Review the ${nearDueCount} near-due ${nearDueCount === 1 ? "item" : "items"} first and confirm the owner, dependency status, and target completion date for each.`);
  } else {
    priorityActions.push(`Keep the next milestone review focused on upcoming deliverables so any date movement is identified before it becomes urgent.`);
  }
  if (overdueCount > 0) {
    priorityActions.push(`Clear the ${overdueCount} overdue ${overdueCount === 1 ? "item" : "items"} by confirming recovery actions and revised dates before downstream milestones are affected.`);
  }
  priorityActions.push(`Keep the task register current by confirming status, due date, and completion evidence for priority items before the next client update.`);

  const scheduleConfidence: string[] = [];
  if (longDurationCount > 0) {
    scheduleConfidence.push(`Confirm target completion dates for ${longDurationCount} longer-duration ${longDurationCount === 1 ? "Gantt item" : "Gantt items"} and split any broad activity into measurable deliverables if tracking is unclear.`);
  } else {
    scheduleConfidence.push(`The current Gantt timeline remains trackable when date changes are captured promptly and reflected in the task register.`);
  }
  if (missingDateCount > 0) {
    scheduleConfidence.push(`Resolve ${missingDateCount} ${missingDateCount === 1 ? "task" : "tasks"} without clear scheduling information by adding confirmed owners and due dates.`);
  } else {
    scheduleConfidence.push(`Continue validating planned dates during each review so schedule confidence is based on current task-level information.`);
  }
  scheduleConfidence.push(`Communicate date changes early, including the impact on upcoming milestones and any client decision needed to preserve the timeline.`);

  const clientNextSteps = [
    `Maintain a weekly progress update using the Gantt timeline and task register as the source of truth for completed, active, and pending work.`,
    `Confirm acceptance criteria for upcoming deliverables so completion can be recorded without delay once work is ready for review.`,
    upcomingCount > 0
      ? `Review the next ${Math.min(upcomingCount, 3)} upcoming ${upcomingCount === 1 ? "deliverable" : "deliverables"} with stakeholders and confirm whether any client input is needed.`
      : `Review the next planned deliverables with stakeholders and confirm whether any client input is needed before work advances.`,
    `Approve scope or date changes quickly once the impact on existing delivery commitments is visible.`,
  ];

  return [
    { title: "Delivery Focus", color: COLORS.blue, bullets: deliveryFocus.slice(0, 4) },
    { title: "Priority Actions", color: COLORS.orange, bullets: priorityActions.slice(0, 4) },
    { title: "Schedule Confidence", color: COLORS.purple, bullets: scheduleConfidence.slice(0, 4) },
    { title: "Client Next Steps", color: COLORS.green, bullets: clientNextSteps.slice(0, 4) },
  ];
}

function estimatedTextWidth(value: unknown, size: number) {
  return clean(value).length * size * 0.56;
}

function clampTextX(value: unknown, x: number, size: number, minX: number, maxX: number) {
  const width = estimatedTextWidth(value, size);
  return Math.max(minX, Math.min(maxX - width, x));
}

function clientSectionHeader(c: Canvas, title: string, y = 24) {
  const h = 38;
  const size = 20;
  const textY = y + (h - size) / 2;
  c.rect(M, y, PAGE_W - M * 2, h, COLORS.dark);
  c.text(title.toUpperCase(), M + 14, textY, size, "#ffffff", true);
}

function compactDuration(startValue: string | null, endValue: string | null) {
  const start = new Date(startValue ?? "").getTime();
  const end = new Date(endValue ?? "").getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  const days = Math.max(1, Math.ceil((end - start) / 86400000));
  return days >= 14 && days % 7 === 0 ? `${days / 7}w` : `${days}d`;
}

function drawGanttDurationLabel(
  c: Canvas,
  label: string,
  barX: number,
  barY: number,
  barW: number,
  timelineX: number,
  timelineRight: number,
  insideColor: string,
  outsideColor: string,
) {
  if (!label) return;
  const size = 7.5;
  const labelW = estimatedTextWidth(label, size);
  const textY = barY + 2;
  if (barW >= labelW + 8) {
    c.text(label, barX + 4, textY, size, insideColor, true);
    return;
  }
  if (barX + barW + 4 + labelW <= timelineRight) {
    c.text(label, barX + barW + 4, textY, size, outsideColor, true);
    return;
  }
  if (barX - 4 - labelW >= timelineX) {
    c.text(label, barX - 4 - labelW, textY, size, outsideColor, true);
  }
}

function donutSegment(c: Canvas, cx: number, cy: number, outerR: number, innerR: number, startAngle: number, endAngle: number, color: string) {
  if (endAngle <= startAngle) return;
  const steps = Math.max(1, Math.ceil(((endAngle - startAngle) / (Math.PI * 2)) * 64));
  const outerPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + ((endAngle - startAngle) * index) / steps;
    return { x: cx + Math.cos(angle) * outerR, y: cy + Math.sin(angle) * outerR };
  });
  const innerPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = endAngle - ((endAngle - startAngle) * index) / steps;
    return { x: cx + Math.cos(angle) * innerR, y: cy + Math.sin(angle) * innerR };
  });
  c.polygon([...outerPoints, ...innerPoints], color);
}

function drawCenteredText(c: Canvas, value: unknown, cx: number, y: number, size: number, color = COLORS.ink, bold = false) {
  c.text(value, cx - estimatedTextWidth(value, size) / 2, y, size, color, bold);
}

function drawClientStatusDonut(
  c: Canvas,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  statusRows: { label: string; value: number; color: string }[],
  total: number,
) {
  if (total <= 0) {
    donutSegment(c, cx, cy, outerR, innerR, -Math.PI / 2, Math.PI * 1.5, "#e5e7eb");
    drawCenteredText(c, "0", cx, cy - 18, 24, COLORS.ink, true);
    drawCenteredText(c, "Tasks", cx, cy + 10, 10, COLORS.muted, true);
    return;
  }

  let angle = -Math.PI / 2;
  statusRows.forEach((row) => {
    if (row.value <= 0) return;
    const nextAngle = angle + (row.value / total) * Math.PI * 2;
    donutSegment(c, cx, cy, outerR, innerR, angle, nextAngle, row.color);
    angle = nextAngle;
  });

  drawCenteredText(c, total, cx, cy - 18, 24, COLORS.ink, true);
  drawCenteredText(c, "Tasks", cx, cy + 10, 10, COLORS.muted, true);
}

function clientCompactBars(c: Canvas, x: number, y: number, w: number, rows: { label: string; value: number; color: string }[], maxValue?: number) {
  const max = Math.max(1, maxValue ?? Math.max(...rows.map((row) => row.value), 1));
  rows.forEach((row, index) => {
    const top = y + index * 18;
    c.text(wrap(row.label, 28, 1)[0], x, top, 7.5, COLORS.ink, true);
    c.text(row.value, x + w - 24, top, 7.5, COLORS.muted, true);
    c.bar(x, top + 10, w, 6, row.value / max * 100, row.color);
  });
}

type ClientKanbanColumn = {
  key: "todo" | "inProgress" | "inReview" | "completed" | "overdue";
  title: string;
  color: string;
  tasks: DetailedTaskRegisterItem[];
};

function clientTaskDateMs(value: string | null | undefined, fallback: number) {
  if (!value || value === "--") return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : time;
}

function clientCompletionSortMs(task: DetailedTaskRegisterItem) {
  const datedTask = task as DetailedTaskRegisterItem & {
    completedAt?: string | null;
    completed_at?: string | null;
    updatedAt?: string | null;
    updated_at?: string | null;
  };
  return clientTaskDateMs(datedTask.completedAt ?? datedTask.completed_at ?? datedTask.updatedAt ?? datedTask.updated_at, Number.NaN);
}

function groupTasksForClientKanban(tasks: DetailedTaskRegisterItem[]): ClientKanbanColumn[] {
  const columns: ClientKanbanColumn[] = [
    { key: "todo", title: "Todo / Not Started", color: CLIENT_STATUS_COLORS.todo, tasks: [] },
    { key: "inProgress", title: "In Progress", color: CLIENT_STATUS_COLORS.inProgress, tasks: [] },
    { key: "inReview", title: "In Review", color: CLIENT_STATUS_COLORS.inReview, tasks: [] },
    { key: "completed", title: "Completed", color: CLIENT_STATUS_COLORS.completed, tasks: [] },
    { key: "overdue", title: "Overdue", color: CLIENT_STATUS_COLORS.overdue, tasks: [] },
  ];
  const byKey = new Map(columns.map((column) => [column.key, column]));

  tasks.forEach((task) => {
    const statusLabel = clean(task.status).toLowerCase();
    const statusKey = task.statusKey as ReportStatusKey | "in_review" | string;
    if (statusKey === "overdue") byKey.get("overdue")?.tasks.push(task);
    else if (statusKey === "completed" || statusKey === "done_early") byKey.get("completed")?.tasks.push(task);
    else if (statusKey === "in_review" || statusLabel.includes("review")) byKey.get("inReview")?.tasks.push(task);
    else if (statusKey === "not_started") byKey.get("todo")?.tasks.push(task);
    else byKey.get("inProgress")?.tasks.push(task);
  });

  columns.forEach((column) => {
    if (column.key === "completed") {
      column.tasks = column.tasks
        .map((task, index) => ({ task, index, sortDate: clientCompletionSortMs(task) }))
        .sort((a, b) => {
          if (Number.isNaN(a.sortDate) && Number.isNaN(b.sortDate)) return a.index - b.index;
          if (Number.isNaN(a.sortDate)) return 1;
          if (Number.isNaN(b.sortDate)) return -1;
          return b.sortDate - a.sortDate;
        })
        .map((row) => row.task);
      return;
    }

    column.tasks = column.tasks
      .map((task, index) => ({
        task,
        index,
        sortDate: clientTaskDateMs(task.dueDate, Number.POSITIVE_INFINITY),
      }))
      .sort((a, b) => a.sortDate - b.sortDate || a.index - b.index)
      .map((row) => row.task);
  });

  return columns;
}

function buildClientKanbanPage(pdf: PdfDoc, report: ExecutiveReportData) {
  const columns = groupTasksForClientKanban(report.taskRegister ?? []);
  pdf.addPage((c, pageNo, pageCount) => {
    clientSectionHeader(c, "Client Kanban Summary");
    const columnGap = 10;
    const columnY = 86;
    const columnH = 430;
    const columnW = (PAGE_W - M * 2 - columnGap * 4) / 5;

    columns.forEach((column, index) => {
      const x = M + index * (columnW + columnGap);
      c.rect(x, columnY, columnW, columnH, "#f8fafc", COLORS.border);
      c.rect(x, columnY, columnW, 5, column.color);
      c.textLines(wrap(column.title, 18, 2), x + 8, columnY + 18, 8.5, COLORS.ink, true, 10);
      c.rect(x + columnW - 36, columnY + 14, 24, 18, column.color);
      c.text(column.tasks.length, x + columnW - 28, columnY + 18, 9, "#ffffff", true);

      const visibleTasks = column.tasks.slice(0, 5);
      visibleTasks.forEach((task, taskIndex) => {
        const cardY = columnY + 56 + taskIndex * 64;
        const titleLines = wrap(task.title, 23, 2);
        c.rect(x + 8, cardY, columnW - 16, 54, COLORS.panel, COLORS.border);
        c.textLines(titleLines, x + 14, cardY + 10, 7.5, COLORS.ink, true, 9);
        if (task.dueDate && task.dueDate !== "--") c.text(`Due ${task.dueDate}`, x + 14, cardY + 40, 7, COLORS.muted);
      });

      if (column.tasks.length > 5) {
        c.text(`+${column.tasks.length - 5} more`, x + 12, columnY + 390, 8, column.color, true);
      }
    });

    footer(c, report.generatedAt, pageNo, pageCount);
  });
}

function clientGanttLegend(c: Canvas) {
  const items = [
    ["Todo / Not Started", CLIENT_STATUS_COLORS.todo], ["In Progress", CLIENT_STATUS_COLORS.inProgress], ["In Review", CLIENT_STATUS_COLORS.inReview],
    ["Completed", CLIENT_STATUS_COLORS.completed], ["Overdue", CLIENT_STATUS_COLORS.overdue], ["Near Due", CLIENT_STATUS_COLORS.nearDue],
  ] as const;
  let x = M;
  items.forEach(([label, color]) => {
    c.rect(x, 548, 8, 8, color);
    c.text(label, x + 12, 547, 7.5, COLORS.muted);
    x += label.length * 4.5 + 30;
  });
}

function buildClientProjectPdf(report: ExecutiveReportData) {
  const pdf = new PdfDoc();
  const summary = report.statusSummary ?? {
    todo: Math.max(0, report.kpis.total - report.kpis.completed - report.kpis.inProgress - report.kpis.overdue),
    inProgress: report.kpis.inProgress,
    inReview: 0,
    completed: report.kpis.completed,
    overdue: report.kpis.overdue,
  };
  const progress = [
    { label: "Completed", value: summary.completed, color: CLIENT_STATUS_COLORS.completed },
    { label: "In Progress", value: summary.inProgress, color: CLIENT_STATUS_COLORS.inProgress },
    { label: "In Review", value: summary.inReview, color: CLIENT_STATUS_COLORS.inReview },
    { label: "Todo", value: summary.todo, color: CLIENT_STATUS_COLORS.todo },
    { label: "Overdue", value: summary.overdue, color: CLIENT_STATUS_COLORS.overdue },
  ];
  const progressTotal = Math.max(1, progress.reduce((sum, item) => sum + item.value, 0));
  const statusRows = [
    { label: "Todo / Not Started", value: summary.todo, color: CLIENT_STATUS_COLORS.todo },
    { label: "In Progress", value: summary.inProgress, color: CLIENT_STATUS_COLORS.inProgress },
    { label: "In Review", value: summary.inReview, color: CLIENT_STATUS_COLORS.inReview },
    { label: "Completed", value: summary.completed, color: CLIENT_STATUS_COLORS.completed },
    { label: "Overdue", value: summary.overdue, color: CLIENT_STATUS_COLORS.overdue },
  ];
  const statusTotal = statusRows.reduce((sum, item) => sum + item.value, 0);

  pdf.addPage((c, pageNo, pageCount) => {
    c.rect(0, 0, PAGE_W, PAGE_H, COLORS.dark);
    c.text("POWERED BY", M, 36, 9, "#a7b0d6", true);
    c.text(BRAND_NAME_UPPER, M, 52, 15, "#ffffff", true);
    c.text("CLIENT PROJECT REPORT", M, 102, 34, "#ffffff", true);
    c.text(report.projectName, M, 148, 18, "#c7d2fe", true);
    c.text(`Owner: ${BRAND_NAME}`, M, 194, 12, "#dbeafe");
    c.text(`Generated Date: ${formatDate(report.generatedAt)}`, M, 214, 12, "#dbeafe");
    const cards = [
      ["Total Tasks", report.kpis.total, CLIENT_STATUS_COLORS.todo],
      ["Completed", report.kpis.completed, CLIENT_STATUS_COLORS.completed],
      ["In Progress", summary.inProgress, CLIENT_STATUS_COLORS.inProgress],
      ["Overdue", report.kpis.overdue, report.kpis.overdue ? CLIENT_STATUS_COLORS.overdue : CLIENT_STATUS_COLORS.completed],
    ] as const;
    cards.forEach((card, index) => kpi(c, M + index * 195, 282, 178, card[0], card[1], card[2]));
    c.text("Overall Progress", M, 394, 14, "#ffffff", true);
    let barX = M;
    const barW = PAGE_W - M * 2;
    progress.forEach((item) => {
      const width = barW * item.value / progressTotal;
      if (width > 0) c.rect(barX, 420, width, 18, item.color);
      barX += width;
    });
    let legendX = M;
    progress.forEach((item) => {
      c.rect(legendX, 456, 9, 9, item.color);
      c.text(`${item.label}: ${item.value}`, legendX + 14, 455, 8.5, "#dbeafe");
      legendX += 150;
    });
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  pdf.addPage((c, pageNo, pageCount) => {
    clientSectionHeader(c, "Client Status Summary");
    c.text("Task Status Distribution", 82, 88, 13, COLORS.ink, true);
    drawClientStatusDonut(c, 220, 225, 95, 54, statusRows, statusTotal);
    statusRows.forEach((row, index) => {
      const cardX = 430 + (index % 2) * 180;
      const cardY = 92 + Math.floor(index / 2) * 64;
      c.rect(cardX, cardY, 165, 52, COLORS.panel, "#d9d5f5");
      c.rect(cardX, cardY, 6, 52, row.color);
      c.text(row.label.toUpperCase(), cardX + 16, cardY + 10, 8, COLORS.muted, true);
      c.text(row.value, cardX + 16, cardY + 27, 18, row.color, true);
    });
    panel(c, M, 385, PAGE_W - M * 2, 130, "Status Breakdown");
    clientCompactBars(c, M + 18, 422, PAGE_W - M * 2 - 36, statusRows, Math.max(1, statusTotal));
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  buildClientKanbanPage(pdf, report);

  const ganttChunks = report.gantt.tasks.length ? chunk(report.gantt.tasks, 8) : [[]];
  ganttChunks.forEach((ganttRows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      clientSectionHeader(c, chunkIndex === 0 ? "Project Gantt Timeline" : "Project Gantt Timeline Continued");
      c.text(`${formatDate(report.gantt.rangeStart)} to ${formatDate(report.gantt.rangeEnd)}`, M, 70, 12, COLORS.ink, true);
      const x = M;
      const y = 92;
      const labelW = 205;
      const timelineX = x + labelW + 8;
      const timelineRight = PAGE_W - M - 20;
      const timelineW = timelineRight - timelineX;
      miniTable(c, x, y, [labelW], ["Task Name"], [], 24);
      if (ganttRows.length === 0) c.text("No dated tasks available for this Gantt range.", x + 8, y + 48, 12, COLORS.muted);
      const startMs = new Date(report.gantt.rangeStart).getTime();
      const endMs = new Date(report.gantt.rangeEnd).getTime();
      const spanMs = Math.max(1, endMs - startMs);
      let rowTop = y + 42;
      ganttRows.forEach((task, index) => {
        const titleLines = wrap(task.title, 32, 3);
        const rowH = Math.max(32, titleLines.length * 11 + 12);
        c.rect(x, rowTop, timelineRight - x, rowH, index % 2 === 0 ? "#ffffff" : "#f8fafc", COLORS.border);
        c.textLines(titleLines, x + 5, rowTop + 9, 8.5, COLORS.ink, true, 11);
        const taskStart = new Date(task.startValue ?? report.gantt.rangeStart).getTime();
        const taskEnd = new Date(task.endValue ?? report.gantt.rangeEnd).getTime();
        const clippedStart = Math.max(startMs, taskStart);
        const clippedEnd = Math.min(endMs, taskEnd);
        if (clippedEnd >= clippedStart) {
          const left = clamp(((clippedStart - startMs) / spanMs) * 100);
          const width = Math.max(2, clamp(((clippedEnd - clippedStart) / spanMs) * 100, 1, 100 - left));
          const barX = Math.max(timelineX, Math.min(timelineRight, timelineX + timelineW * left / 100));
          const barW = Math.min(timelineRight - barX, Math.max(5, timelineW * width / 100));
          const color = clientStatusColor(task.statusKey, task.status);
          if (barW >= 2) {
            const barY = rowTop + 11;
            c.rect(barX, barY, barW, 13, color);
            const duration = compactDuration(task.startValue, task.endValue);
            drawGanttDurationLabel(c, duration, barX, barY, barW, timelineX, timelineRight, "#ffffff", COLORS.ink);
          }
        }
        rowTop += rowH + 2;
      });
      const dateTickItems = dateTicks(report.gantt.rangeStart, report.gantt.rangeEnd)
        .map((tick) => ({
          ...tick,
          x: Math.max(timelineX, Math.min(timelineRight, timelineX + timelineW * tick.left / 100)),
        }))
        .filter((tick, index, ticks) => {
          if (index === 0) return ticks.length === 1 || ticks[ticks.length - 1].x - tick.x >= 36;
          if (index === ticks.length - 1) return true;
          return tick.x - ticks[index - 1].x >= 36 && ticks[index + 1].x - tick.x >= 36;
        });
      dateTickItems.forEach((tick) => {
        const tickX = Math.max(timelineX, Math.min(timelineRight, tick.x));
        c.line(tickX, y, tickX, 530, "#e5e7eb", 0.5);
        c.text(tick.label, clampTextX(tick.label, tickX + 2, 7.5, timelineX, timelineRight), y + 23, 7.5, COLORS.muted);
      });
      const monthTickItems = monthTicks(report.gantt.rangeStart, report.gantt.rangeEnd)
        .map((tick) => ({
          ...tick,
          x: Math.max(timelineX, Math.min(timelineRight, timelineX + timelineW * tick.left / 100)),
        }))
        .filter((tick, index, ticks) => index === 0 || tick.x - ticks[index - 1].x >= 24);
      monthTickItems.forEach((tick) => {
        const desiredX = tick.x - estimatedTextWidth(tick.label, 8.5) / 2;
        c.text(tick.label, clampTextX(tick.label, desiredX, 8.5, timelineX, timelineRight), y + 8, 8.5, COLORS.muted, true);
      });
      clientGanttLegend(c);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const register = report.taskRegister ?? [];
  for (let offset = 0; offset < register.length || offset === 0; offset += 10) {
    const rows = register.slice(offset, offset + 10);
    pdf.addPage((c, pageNo, pageCount) => {
      clientSectionHeader(c, offset === 0 ? "Client Task Register" : "Client Task Register Continued");
      miniTable(
        c, M, 82,
        [300, 100, 70, 92, 92, 90],
        ["Task Name", "Status", "Progress %", "Start Date", "Due Date", "Time Left"],
        rows.map((task) => [task.title, task.status, `${task.progress}%`, task.startDate, task.dueDate, task.timeLeft]),
        40,
      );
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  }

  pdf.addPage((c, pageNo, pageCount) => {
    clientSectionHeader(c, "Project Manager's Recommendation");
    buildClientRecommendationCards(report).forEach((card, index) => {
      const x = M + index * 195;
      panel(c, x, 88, 178, 392, card.title);
      c.rect(x, 114, 178, 5, card.color);
      let textY = 142;
      card.bullets.slice(0, 4).forEach((item) => {
        const lines = wrap(item, 22, 4);
        c.text("-", x + 12, textY, 9.5, card.color, true);
        c.textLines(lines, x + 25, textY, 8.4, COLORS.ink, false, 11);
        textY += lines.length * 11 + 16;
      });
    });
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  return pdf.build();
}

function buildProjectPdf(report: ExecutiveReportData) {
  if (report.audience === "client") return buildClientProjectPdf(report);

  const pdf = new PdfDoc();
  const active = Math.max(0, report.kpis.total - report.kpis.completed);
  const statusBannerColor = report.health.riskLevel === "High" ? COLORS.red : report.health.riskLevel === "Medium" ? COLORS.orange : COLORS.green;
  const upcoming = report.timeline.filter((task) => task.statusKey === "near_due" || task.statusKey === "in_progress" || task.statusKey === "not_started");

  pdf.addPage((c, pageNo, pageCount) => {
    const leadLines = wrap(formatLeadLine(report.leads), 76, 2);
    c.rect(0, 0, PAGE_W, PAGE_H, COLORS.dark);
    c.text("POWERED BY", M, 36, 9, "#a7b0d6", true);
    c.text(BRAND_NAME_UPPER, M, 52, 15, "#ffffff", true);
    c.text("PROJECT EXECUTIVE REPORT", M, 102, 34, "#ffffff", true);
    c.text(report.projectName, M, 148, 18, "#c7d2fe", true);
    c.text("Project Details", M, 184, 12, "#ffffff", true);
    c.text(`Owner: ${report.leads.owner}`, M, 206, 12, "#dbeafe");
    c.textLines(leadLines, M, 224, 12, "#dbeafe", false, 15);
    c.text(`Generated Date: ${formatDate(report.generatedAt)}`, M, 262, 12, "#dbeafe");
    const cards = [
      ["Completion %", `${report.health.completionRate}%`, COLORS.green],
      ["Health Status", report.health.label, statusBannerColor],
      ["Active Tasks", active, COLORS.blue],
      ["Overdue Tasks", report.kpis.overdue, report.kpis.overdue ? COLORS.red : COLORS.green],
      ["Risk Level", report.health.riskLevel, statusBannerColor],
      ["Team Members", report.team.length, COLORS.purple],
    ] as const;
    cards.forEach((card, index) => kpi(c, M + (index % 3) * 258, 344 + Math.floor(index / 3) * 88, 238, card[0], card[1], card[2]));
    c.text("Executive Snapshot", M, 316, 16, "#ffffff", true);
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  pdf.addPage((c, pageNo, pageCount) => {
    sectionHeader(c, "Executive Dashboard");
    kpi(c, M, 82, 238, "Completion", `${report.health.completionRate}%`, COLORS.green);
    kpi(c, 302, 82, 238, "Risk", report.health.riskLevel, statusBannerColor);
    kpi(c, 572, 82, 238, "Utilization", `${report.resource.averageUtilization}%`, COLORS.purple);
    panel(c, M, 176, PAGE_W - M * 2, 128, "Status Distribution");
    const statusRows = report.statusDistribution.map((row) => ({ label: row.label, value: row.count, color: row.color }));
    const maxStatus = Math.max(1, report.kpis.total);
    statusRows.forEach((row, index) => {
      const top = 214 + index * 15;
      c.text(wrap(row.label, 28, 1)[0], M + 18, top, 8.5, COLORS.ink, true);
      c.text(row.value, M + 182, top, 8.5, COLORS.muted, true);
      c.bar(M + 210, top + 2, PAGE_W - M * 2 - 240, 7, row.value / maxStatus * 100, row.color);
    });
    panel(c, M, 326, PAGE_W - M * 2, 206, "Upcoming Milestones");
    miniTableDynamicRows(
      c,
      M,
      352,
      [260, 150, 120, 110, 138],
      ["Task", "Owner", "Due Date", "Status", "Days Remaining"],
      upcoming.slice(0, 6).map((task) => {
        const registerItem = report.taskRegister.find((item) => item.id === task.id);
        return [task.title, task.owner, task.dueDate, task.status, registerItem?.timeLeft ?? task.dueDate];
      }),
      28,
      526,
    );
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  const firstTeamRows = report.team.slice(0, 9);
  const continuedTeamChunks = chunk(report.team.slice(9), 15);
  [firstTeamRows, ...continuedTeamChunks].forEach((teamRows, chunkIndex) => {
    if (teamRows.length === 0 && report.team.length > 0) return;
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Team Performance" : "Team Performance Continued");
      if (chunkIndex === 0) {
        panel(c, M, 76, 350, 172, "Workload Distribution Chart");
        bars(c, M + 14, 112, 320, report.team.slice(0, 5).map((row) => ({ label: row.name, value: row.utilization, color: row.utilization >= 85 ? COLORS.red : row.utilization <= 35 ? COLORS.orange : COLORS.blue })), 100);
        panel(c, 420, 76, 378, 172, "Team Capacity Chart");
        bars(c, 438, 112, 338, report.team.slice(0, 5).map((row) => ({ label: row.name, value: row.active, color: row.utilization >= 85 ? COLORS.red : COLORS.green })));
      }
      miniTable(
        c,
        M,
        chunkIndex === 0 ? 278 : 82,
        [235, 90, 90, 90, 110, 110],
        ["Member", "Active", "Completed", "Overdue", "Utilization", "Capacity"],
        teamRows.map((row) => [
          row.name,
          row.active,
          row.completed,
          row.overdue,
          `${row.utilization}%`,
          row.utilization >= 85 ? "Overloaded" : row.utilization <= 35 ? "Underutilized" : "Balanced",
        ]),
        28,
      );
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  chunk(report.gantt.tasks, 10).forEach((ganttRows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Full Gantt Timeline" : "Full Gantt Timeline Continued");
      c.text(`${formatDate(report.gantt.rangeStart)} to ${formatDate(report.gantt.rangeEnd)}`, M, 70, 13, COLORS.ink, true);
      const x = M;
      const y = 92;
      const widths = [138, 62, 60, 58, 58, 50];
      const labelW = widths.reduce((sum, width) => sum + width, 0);
      const timelineX = x + labelW + 8;
      const timelineW = PAGE_W - timelineX - M;
      miniTable(c, x, y, widths, ["Task Name", "Owner", "Status", "Start", "Due", "Dur"], [], 24);
      if (report.gantt.tasks.length === 0) {
        c.text("No dated tasks available for this Gantt range.", x + 8, y + 48, 12, COLORS.muted);
        footer(c, report.generatedAt, pageNo, pageCount);
        return;
      }
      const startMs = new Date(report.gantt.rangeStart).getTime();
      const endMs = new Date(report.gantt.rangeEnd).getTime();
      const spanMs = Math.max(1, endMs - startMs);
      let rowTop = y + 42;
      ganttRows.forEach((task, index) => {
        const titleLines = wrap(task.title, 22, 2);
        const rowH = titleLines.length > 1 ? 38 : 30;
        const top = rowTop;
        c.rect(x, top, timelineW + labelW + 8, rowH, index % 2 === 0 ? "#ffffff" : "#f8fafc", COLORS.border);
        const startDate = new Date(task.startValue ?? "");
        const endDate = new Date(task.endValue ?? "");
        const duration = Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())
          ? "--"
          : `${Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000))}d`;
        const row = [task.title, task.owner, task.status, formatDate(task.startValue), formatDate(task.endValue), duration];
        let cursor = x;
        row.forEach((cell, cellIndex) => {
          c.textLines(wrap(cell, Math.floor(widths[cellIndex] / 6), cellIndex === 0 ? 2 : 1), cursor + 4, top + 9, 8.5, cellIndex === 2 ? statusColor(task.statusKey) : COLORS.ink, cellIndex === 2, 11);
          cursor += widths[cellIndex];
        });
        const taskStart = new Date(task.startValue ?? report.gantt.rangeStart).getTime();
        const taskEnd = new Date(task.endValue ?? report.gantt.rangeEnd).getTime();
        const clippedStart = Math.max(startMs, taskStart);
        const clippedEnd = Math.min(endMs, taskEnd);
        if (clippedEnd >= clippedStart) {
          const left = clamp(((clippedStart - startMs) / spanMs) * 100);
          const width = Math.max(2, clamp(((clippedEnd - clippedStart) / spanMs) * 100, 1, 100 - left));
          const barX = timelineX + timelineW * left / 100;
          const barW = Math.max(5, timelineW * width / 100);
          const barY = top + 10;
          c.rect(barX, barY, barW, 10, statusColor(task.statusKey));
          if (task.statusKey === "completed" || task.statusKey === "done_early") c.rect(barX, barY, barW, 10, COLORS.green);
          c.rect(Math.min(timelineX + timelineW - 4, barX + barW - 3), top + 8, 6, 14, statusColor(task.statusKey));
          drawGanttDurationLabel(c, duration === "--" ? "" : duration, barX, barY, barW, timelineX, timelineX + timelineW, "#ffffff", COLORS.ink);
        }
        rowTop += rowH + 2;
      });
      dateTicks(report.gantt.rangeStart, report.gantt.rangeEnd).forEach((tick) => {
        const tickX = timelineX + timelineW * tick.left / 100;
        c.line(tickX, y, tickX, 528, "#e5e7eb", 0.5);
        c.text(tick.label, tickX + 2, y + 23, 7.5, COLORS.muted);
      });
      monthTicks(report.gantt.rangeStart, report.gantt.rangeEnd).forEach((tick) => {
        const tickX = timelineX + timelineW * tick.left / 100;
        c.text(tick.label, tickX - 7, y + 8, 8.5, COLORS.muted, true);
      });
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const riskRows = [
    ...report.risks.overdue.map((task) => [task.title, "Schedule delay", "High", task.owner, "Confirm blocker, owner, and recovery date.", task.status]),
    ...report.risks.nearDue.map((task) => [task.title, "Near-term delivery risk", "Medium", task.owner, "Run near-due checkpoint and protect delivery path.", task.status]),
    ...report.risks.stale.map((task) => [task.title, "Stale execution signal", "Medium", task.owner, "Require status update or closure decision.", task.status]),
    ...report.risks.inactive.map((task) => [task.title, "Inactive ownership", "Low", task.owner, "Assign accountable owner and next action.", task.status]),
  ];
  if (riskRows.length > 0) {
    chunk(riskRows, 10).forEach((rows, chunkIndex) => {
      pdf.addPage((c, pageNo, pageCount) => {
        sectionHeader(c, chunkIndex === 0 ? "Risk Register" : "Risk Register Continued");
        miniTable(c, M, 82, [190, 122, 68, 96, 210, 70], ["Risk", "Impact", "Severity", "Owner", "Mitigation", "Status"], rows, 40);
        footer(c, report.generatedAt, pageNo, pageCount);
      });
    });
  }

  const incomplete = report.taskRegister.filter((task) => task.statusKey !== "completed" && task.statusKey !== "done_early");
  chunk(incomplete, 13).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Action Tracker" : "Action Tracker Continued");
      miniTable(
        c,
        M,
        82,
        [250, 110, 90, 92, 72, 110],
        ["Action", "Owner", "Due Date", "Status", "Priority", "Days Remaining"],
        rows.map((task) => [task.title, task.owner, task.dueDate, task.status, task.priority, task.timeLeft]),
        34,
      );
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const register = report.taskRegister.length ? report.taskRegister : report.gantt.tasks.map((task) => ({
    ...task,
    progress: task.statusKey === "completed" || task.statusKey === "done_early" ? 100 : task.statusKey === "not_started" ? 0 : 50,
    startDate: formatDate(task.startValue),
    timeLeft: task.statusKey === "overdue" ? "Overdue" : task.dueDate,
    comments: 0,
    description: "",
    priority: task.statusKey === "overdue" ? "High" : task.statusKey === "near_due" ? "Medium" : "Low",
  }));
  for (let offset = 0; offset < register.length || offset === 0; offset += 9) {
    const rows = register.slice(offset, offset + 9);
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, offset === 0 ? "Detailed Task Register" : "Detailed Task Register Continued");
      miniTable(
        c,
        M,
        82,
        [120, 70, 58, 44, 64, 64, 62, 42, 54, 178],
        ["Task", "Owner", "Status", "Prog", "Start", "Due", "Time Left", "Cmnts", "Priority", "Description"],
        rows.map((task) => [task.title, task.owner, task.status, `${task.progress}%`, task.startDate, task.dueDate, task.timeLeft, task.comments, task.priority, wrapCell(task.description, 26, 2).join(" ")]),
        46,
      );
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  }

  pdf.addPage((c, pageNo, pageCount) => {
    sectionHeader(c, "Project Manager's Recommendation");
    const columns = [
      { title: "Bottlenecks", items: report.recommendations.slice(0, 2), color: COLORS.red },
      { title: "Priority Actions", items: report.recommendations.slice(2, 4), color: COLORS.orange },
      { title: "Staffing", items: report.resource.overloaded.map((row) => `Rebalance ${row.name} at ${row.utilization}% utilization.`).slice(0, 3), color: COLORS.blue },
      { title: "Schedule", items: report.timeline.slice(0, 3).map((task) => `Checkpoint ${task.title} by ${task.dueDate}.`), color: COLORS.purple },
    ];
    columns.forEach((column, index) => {
      const x = M + index * 195;
      panel(c, x, 88, 178, 320, column.title);
      c.rect(x, 114, 178, 5, column.color);
      const items = column.items.length ? column.items : ["No major signal detected from current report data."];
      items.forEach((item, itemIndex) => c.textLines(wrap(item, 24, 4), x + 12, 142 + itemIndex * 70, 9.5, COLORS.ink));
    });
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  return pdf.build();
}

function buildUserPdf(report: UserPerformanceReportData) {
  const pdf = new PdfDoc();

  pdf.addPage((c, pageNo, pageCount) => {
    c.rect(0, 0, PAGE_W, PAGE_H, COLORS.dark);
    c.text("POWERED BY", M, 36, 9, "#a7b0d6", true);
    c.text(BRAND_NAME_UPPER, M, 52, 15, "#ffffff", true);
    c.text("USER PERFORMANCE REPORT", M, 102, 34, "#ffffff", true);
    c.text(`${report.userName} / ${report.projectName}`, M, 148, 18, "#c7d2fe", true);
    c.text(`Generated Date: ${formatDate(report.generatedAt)}`, M, 184, 12, "#dbeafe");
    const cards = [
      ["Completion %", `${report.summary.completionRate}%`, COLORS.green],
      ["Active Tasks", report.summary.activeTasks, COLORS.blue],
      ["Overdue Tasks", report.summary.overdueTasks, report.summary.overdueTasks ? COLORS.red : COLORS.green],
      ["Near Due", report.summary.nearDueTasks, COLORS.orange],
      ["Assignments", report.summary.totalAssignments, COLORS.purple],
      ["Utilization", `${report.workload.utilizationScore}%`, report.workload.utilizationScore >= 85 ? COLORS.red : COLORS.blue],
    ] as const;
    c.text("Performance Snapshot", M, 316, 16, "#ffffff", true);
    cards.forEach((card, index) => kpi(c, M + (index % 3) * 258, 344 + Math.floor(index / 3) * 88, 238, card[0], card[1], card[2]));
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  pdf.addPage((c, pageNo, pageCount) => {
    userSectionHeader(c, "Executive Summary and Workload");
    kpi(c, M, 76, 140, "Completion", `${report.summary.completionRate}%`, COLORS.green);
    kpi(c, 188, 76, 140, "Active", report.summary.activeTasks, COLORS.blue);
    kpi(c, 344, 76, 140, "Comments", report.contribution.commentsAdded, COLORS.purple);
    kpi(c, 500, 76, 140, "Activity", report.contribution.activityCount, COLORS.orange);
    panel(c, M, 174, 360, 180, "Workload Analysis");
    bars(c, M + 16, 214, 320, [
      { label: "Utilization", value: report.workload.utilizationScore, color: report.workload.utilizationScore >= 85 ? COLORS.red : COLORS.blue },
      { label: "Task Volume", value: report.workload.taskVolume, color: COLORS.purple },
      { label: "Overdue", value: report.summary.overdueTasks, color: COLORS.red },
      { label: "Near Due", value: report.summary.nearDueTasks, color: COLORS.orange },
    ], Math.max(100, report.workload.taskVolume));
    panel(c, 432, 174, 366, 180, "AI Assessment");
    [...report.assessment.strengths, ...report.assessment.concerns, ...report.assessment.recommendations].slice(0, 6)
      .forEach((item, index) => c.textLines(wrap(item, 48, 2), 448, 212 + index * 22, 8.5, COLORS.ink));
    footer(c, report.generatedAt, pageNo, pageCount);
  });

  chunk(report.workHistory, 13).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      userSectionHeader(c, chunkIndex === 0 ? "Work History" : "Work History Continued");
      miniTable(c, M, 82, [245, 120, 120, 120, 130], ["Task", "Assigned Date", "Due Date", "Completed Date", "Status"], rows.map((task) => [task.title, task.assignedDate, task.dueDate, task.completedDate, task.status]), 32);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const userResponsibilities = [...report.responsibilities.overdue, ...report.responsibilities.nearDue, ...report.responsibilities.active];
  chunk(userResponsibilities, 13).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      userSectionHeader(c, chunkIndex === 0 ? "Current Responsibilities" : "Current Responsibilities Continued");
      miniTable(c, M, 82, [330, 160, 120, 130], ["Task", "Owner", "Due Date", "Status"], rows.map((task) => [task.title, task.owner, task.dueDate, statusText(task)]), 32);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  chunk(report.recentComments ?? [], 12).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      userSectionHeader(c, chunkIndex === 0 ? "Comments and Live Chat Activity" : "Comments and Live Chat Continued");
      miniTable(c, M, 82, [125, 210, 410], ["Date", "Task", "Comment"], rows.map((item) => [formatDate(item.createdAt), item.taskName, item.detail]), 36);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  chunk(report.activityTimeline, 12).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      userSectionHeader(c, chunkIndex === 0 ? "Activity Timeline" : "Activity Timeline Continued");
      miniTable(c, M, 82, [125, 100, 200, 320], ["Date", "Type", "Task", "Detail"], rows.map((item) => [formatDate(item.createdAt), item.type, item.taskName, item.detail]), 36);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  return pdf.build();
}

export async function POST(request: Request) {
  try {
    const report = (await request.json()) as GeneratedAiReport;
    const projectData = report.type === "project" && report.audience
      ? { ...report.data, audience: report.audience }
      : report.type === "project" ? report.data : null;
    const pdf = report.type === "project" ? buildProjectPdf(projectData!) : buildUserPdf(report.data);
    const filename = report.type === "project"
      ? projectData?.audience === "client" ? "client-project-report.pdf" : "executive-report.pdf"
      : "user-performance-report.pdf";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF generation failed", error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
