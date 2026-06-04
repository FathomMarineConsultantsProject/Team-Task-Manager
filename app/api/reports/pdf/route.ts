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
};

type ExecutiveReportData = {
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
  | { type: "project"; data: ExecutiveReportData }
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
  c.text("Powered by Fathom Marine Consultancy", M, 569, 10, COLORS.muted, true);
  c.text(`Generated ${formatDate(reportDate)}`, 342, 569, 10, COLORS.muted);
  c.text(`Page ${pageNo} of ${pageCount}`, PAGE_W - 96, 569, 10, COLORS.muted, true);
}

function sectionHeader(c: Canvas, title: string, y = 24) {
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

function buildProjectPdf(report: ExecutiveReportData) {
  const pdf = new PdfDoc();
  const active = Math.max(0, report.kpis.total - report.kpis.completed);
  const statusBannerColor = report.health.riskLevel === "High" ? COLORS.red : report.health.riskLevel === "Medium" ? COLORS.orange : COLORS.green;
  const upcoming = report.timeline.filter((task) => task.statusKey === "near_due" || task.statusKey === "in_progress" || task.statusKey === "not_started");

  pdf.addPage((c, pageNo, pageCount) => {
    c.rect(0, 0, PAGE_W, PAGE_H, COLORS.dark);
    c.text("POWERED BY", M, 36, 9, "#a7b0d6", true);
    c.text("FATHOM MARINE CONSULTANCY", M, 52, 15, "#ffffff", true);
    c.text("PROJECT EXECUTIVE REPORT", M, 102, 34, "#ffffff", true);
    c.text(report.projectName, M, 148, 18, "#c7d2fe", true);
    c.text("Project Details", M, 184, 12, "#ffffff", true);
    c.text(`Owner: ${report.leads.owner}`, M, 206, 12, "#dbeafe");
    c.text(`Primary Lead: ${report.leads.primaryLead}`, M, 224, 12, "#dbeafe");
    c.text(`Supporting Leads: ${report.leads.supportingLeads.join(", ") || "None listed"}`, M, 242, 11, "#a7b0d6");
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
    miniTable(
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
          c.rect(barX, top + 10, barW, 10, statusColor(task.statusKey));
          if (task.statusKey === "completed" || task.statusKey === "done_early") c.rect(barX, top + 10, barW, 10, COLORS.green);
          c.rect(Math.min(timelineX + timelineW - 4, barX + barW - 3), top + 8, 6, 14, statusColor(task.statusKey));
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
      if (report.gantt.currentWeekLeft !== null) {
        const markerX = timelineX + timelineW * report.gantt.currentWeekLeft / 100;
        c.line(markerX, y, markerX, 528, COLORS.ink, 1.2);
      }
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const riskRows = [
    ...report.risks.overdue.map((task) => [task.title, "Schedule delay", "High", task.owner, "Confirm blocker, owner, and recovery date.", task.status]),
    ...report.risks.nearDue.map((task) => [task.title, "Near-term delivery risk", "Medium", task.owner, "Run near-due checkpoint and protect delivery path.", task.status]),
    ...report.risks.stale.map((task) => [task.title, "Stale execution signal", "Medium", task.owner, "Require status update or closure decision.", task.status]),
    ...report.risks.inactive.map((task) => [task.title, "Inactive ownership", "Low", task.owner, "Assign accountable owner and next action.", task.status]),
  ];
  chunk(riskRows, 10).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Risk Register" : "Risk Register Continued");
      miniTable(c, M, 82, [190, 122, 68, 96, 210, 70], ["Risk", "Impact", "Severity", "Owner", "Mitigation", "Status"], rows, 40);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

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
        rows.map((task) => [task.title, task.owner, task.status, `${task.progress}%`, task.startDate, task.dueDate, task.timeLeft, task.comments, task.priority, task.description]),
        46,
      );
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  }

  pdf.addPage((c, pageNo, pageCount) => {
    sectionHeader(c, "AI Recommendations");
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
    c.text("FATHOM MARINE CONSULTANCY", M, 52, 15, "#ffffff", true);
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
    sectionHeader(c, "Executive Summary and Workload");
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
      sectionHeader(c, chunkIndex === 0 ? "Work History" : "Work History Continued");
      miniTable(c, M, 82, [245, 120, 120, 120, 130], ["Task", "Assigned Date", "Due Date", "Completed Date", "Status"], rows.map((task) => [task.title, task.assignedDate, task.dueDate, task.completedDate, task.status]), 32);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  const userResponsibilities = [...report.responsibilities.overdue, ...report.responsibilities.nearDue, ...report.responsibilities.active];
  chunk(userResponsibilities, 13).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Current Responsibilities" : "Current Responsibilities Continued");
      miniTable(c, M, 82, [330, 160, 120, 130], ["Task", "Owner", "Due Date", "Status"], rows.map((task) => [task.title, task.owner, task.dueDate, statusText(task)]), 32);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  chunk(report.recentComments ?? [], 12).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Comments and Live Chat Activity" : "Comments and Live Chat Continued");
      miniTable(c, M, 82, [125, 210, 410], ["Date", "Task", "Comment"], rows.map((item) => [formatDate(item.createdAt), item.taskName, item.detail]), 36);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  chunk(report.activityTimeline, 12).forEach((rows, chunkIndex) => {
    pdf.addPage((c, pageNo, pageCount) => {
      sectionHeader(c, chunkIndex === 0 ? "Activity Timeline" : "Activity Timeline Continued");
      miniTable(c, M, 82, [125, 100, 200, 320], ["Date", "Type", "Task", "Detail"], rows.map((item) => [formatDate(item.createdAt), item.type, item.taskName, item.detail]), 36);
      footer(c, report.generatedAt, pageNo, pageCount);
    });
  });

  return pdf.build();
}

export async function POST(request: Request) {
  try {
    const report = (await request.json()) as GeneratedAiReport;
    const pdf = report.type === "project" ? buildProjectPdf(report.data) : buildUserPdf(report.data);
    const filename = report.type === "project" ? "executive-report.pdf" : "user-performance-report.pdf";
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
