"use client";

import ExcelJS from "exceljs";
import { getProjectTimeSettings, getSignedDaysRemaining } from "@/lib/projectDateTime";
import {
  computeProjectStageDistribution,
  getWorkflowStatusLabel,
  type ReportingColumn,
} from "@/lib/taskReportingStage";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export type ExportTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  assignees: string; // Comma-separated names
  createdBy: string;
  startDate: string | null;
  dueDate: string | null;
  expectedDate?: string | null;
  completedDate?: string | null;
  reviewedDate?: string | null;
  issuedDate?: string | null;
  requiredBy?: string | null;
  reviewCompletedBy?: string | null;
  documentReferenceUrl?: string | null;
  columnId?: string | null;
  stageTitle?: string | null;
  stageColor?: string | null;
  column?: string | null;
  draftReviewStartDate?: string | null;
  reviewDueDate?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  commentsCount: number;
  commentsText?: string;
  commentBlocks?: ExportTaskComment[];
  pendingInputs?: string;
  pendingInputItems?: ExportPendingInput[];
  linkItems?: ExportTaskLink[];
  nextAction?: string;
  targetRevisionDate?: string;
  targetApprovalDate?: string;
  attachmentCount: number;
};

export type ExportTaskComment = {
  author: string;
  createdAt: string | null;
  content: string | null;
};

export type ExportPendingInput = {
  title: string | null;
  details: string | null;
  status: string | null;
  dueAt: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
};

export type ExportTaskLink = {
  url: string;
  label?: string | null;
};

export type ExportProjectData = {
  projectName: string;
  exportScope?: string | null;
  projectReviewers?: string[];
  teamMembers: string[];
  tasks: ExportTask[];
  projectStages?: ReportingColumn[];
  timeZone?: string | null;
  normalWorkdayEnd?: string | null;
};

// -------------------------------------------------------------------
// Design Tokens
// -------------------------------------------------------------------

const DARK_BLUE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
const WHITE_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" } };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

const KPI_GREEN: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
const KPI_BLUE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
const KPI_RED: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
const KPI_ORANGE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFED7AA" } };
const ALT_ROW_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

// -------------------------------------------------------------------
// Status styling
// -------------------------------------------------------------------

const STATUS_FILLS: Record<string, Partial<ExcelJS.Fill>> = {
  todo: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } },
  not_started: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } },
  in_progress: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } },
  draft_review: { type: "pattern", pattern: "solid", fgColor: { argb: "FFCFFAFE" } },
  in_review: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFED7AA" } },
  review: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFED7AA" } },
  done: { type: "pattern", pattern: "solid", fgColor: { argb: "FFBBF7D0" } },
  completed: { type: "pattern", pattern: "solid", fgColor: { argb: "FFBBF7D0" } },
  blocked: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } },
  overdue: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } },
};

// Days Remaining conditional fills
const DAYS_RED: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
const DAYS_ORANGE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFED7AA" } };
const DAYS_GREEN: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
const EXCEL_CELL_TEXT_LIMIT = 32000;
const EXCEL_HYPERLINK_LIMIT = 2000;
const EXCEL_TRUNCATION_NOTICE = "\n\n[Text truncated for Excel compatibility]";
const REVIEW_STATUS_OPTIONS = "Not Started,In Progress,Review Completed";
const REVIEW_STATUS_COLUMN_KEYS = [
  "projectManagementShipyardTeamReviewStatus",
  "fleetManagementReviewDate",
  "marineStandardsReviewDate",
  "talentDevelopmentReviewDate",
];

const HEADER_COLUMNS = [
  { header: "S.No", key: "serialNo", width: 8 },
  { header: "Task Name", key: "title", width: 45 },
  { header: "Project Stage", key: "stageTitle", width: 24 },
  { header: "Workflow Status", key: "workflowStatus", width: 18 },
  { header: "Workflow Progress %", key: "workflowProgress", width: 18 },
  { header: "Description", key: "description", width: 60 },
  { header: "Required By", key: "requiredBy", width: 28 },
  { header: "Assigned To", key: "assignees", width: 35 },
  { header: "Created By", key: "createdBy", width: 20 },
  { header: "Start Date", key: "startDate", width: 14 },
  { header: "Due Date", key: "dueDate", width: 14 },
  { header: "Expected Date", key: "expectedDate", width: 16 },
  { header: "Completed Date", key: "completedDate", width: 16 },
  { header: "Reviewed Date", key: "reviewedDate", width: 16 },
  { header: "Issued Date", key: "issuedDate", width: 16 },
  { header: "Review Completed By", key: "reviewCompletedBy", width: 24 },
  { header: "Document / Reference Link", key: "documentReferenceUrl", width: 40 },
  { header: "Draft Review Start Date", key: "draftReviewStartDate", width: 22 },
  { header: "Review Due Date", key: "reviewDueDate", width: 18 },
  { header: "Created Date", key: "createdAt", width: 14 },
  { header: "Last Updated", key: "updatedAt", width: 14 },
  { header: "Comment Count", key: "commentsCount", width: 14 },
  { header: "Comments", key: "commentsText", width: 70 },
  { header: "Pending Inputs", key: "pendingInputs", width: 55 },
  { header: "Next Action", key: "nextAction", width: 35 },
  { header: "Target Revision Date", key: "targetRevisionDate", width: 22 },
  { header: "Target Approval Date", key: "targetApprovalDate", width: 22 },
  { header: "Attachments", key: "attachmentCount", width: 13 },
  { header: "Days Remaining", key: "daysRemaining", width: 16 },
  { header: "Project Management / Shipyard Team", key: "projectManagementShipyardTeamReviewStatus", width: 28 },
  { header: "Fleet Management", key: "fleetManagementReviewDate", width: 16 },
  { header: "Marine Standards", key: "marineStandardsReviewDate", width: 16 },
  { header: "Talent Development", key: "talentDevelopmentReviewDate", width: 16 },
];

// Column width caps for auto-fit
const COL_MAX_WIDTH: Record<string, number> = {
  serialNo: 8,
  title: 45,
  description: 60,
  assignees: 35,
  commentsText: 70,
  pendingInputs: 55,
  nextAction: 35,
  targetRevisionDate: 22,
  targetApprovalDate: 22,
  fleetManagementReviewDate: 16,
  marineStandardsReviewDate: 16,
  talentDevelopmentReviewDate: 16,
  projectManagementShipyardTeamReviewStatus: 28,
};

// Keys that should wrap text
const WRAP_KEYS = new Set([
  "title",
  "description",
  "assignees",
  "commentsText",
  "pendingInputs",
  "nextAction",
  "targetRevisionDate",
  "targetApprovalDate",
]);

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function sanitizeExcelText(value: unknown, maxLength = EXCEL_CELL_TEXT_LIMIT): string {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, maxLength);
}

function truncateExcelText(value: unknown, maxLength = EXCEL_CELL_TEXT_LIMIT): string {
  const clean = sanitizeExcelText(value, Number.MAX_SAFE_INTEGER);
  if (clean.length > maxLength) {
    return `${clean.slice(0, Math.max(0, maxLength - EXCEL_TRUNCATION_NOTICE.length))}${EXCEL_TRUNCATION_NOTICE}`;
  }
  return clean;
}

function sanitizeExcelUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;

  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!cleaned || cleaned.length > EXCEL_HYPERLINK_LIMIT) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function setSafeCellText(cell: ExcelJS.Cell, value: unknown, maxLength = EXCEL_CELL_TEXT_LIMIT): void {
  cell.value = sanitizeExcelText(value, maxLength);
}

function setSafeHyperlinkCell(cell: ExcelJS.Cell, text: unknown, url: unknown): void {
  const safeText = sanitizeExcelText(text, 500);
  const safeUrl = sanitizeExcelUrl(url);

  if (safeUrl) {
    cell.value = {
      text: safeText || safeUrl,
      hyperlink: safeUrl,
      tooltip: safeUrl.slice(0, 255),
    };
    cell.font = { ...(cell.font ?? {}), color: { argb: "FF0563C1" }, underline: true };
    return;
  }

  cell.value = sanitizeExcelText(url || text);
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "_");
}

function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    todo: "To Do",
    not_started: "Not Started",
    in_progress: "In Progress",
    draft_review: "Draft Review",
    in_review: "In Review",
    review: "In Review",
    done: "Completed",
    completed: "Completed",
    blocked: "Blocked",
  };
  return map[normalizeStatus(status)] ?? status;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDaysRemaining(dueDate: string | null, timeZone: string, normalWorkdayEnd: string, now: Date): number | null {
  return getSignedDaysRemaining({ dueDate, timeZone, workdayEnd: normalWorkdayEnd, now });
}

function getProgress(status: string): number {
  const map: Record<string, number> = {
    todo: 0,
    not_started: 0,
    in_progress: 45,
    draft_review: 60,
    in_review: 75,
    review: 75,
    done: 100,
    completed: 100,
    blocked: 0,
  };
  return map[normalizeStatus(status)] ?? 0;
}

/** Estimate the number of wrapped lines a string will occupy at a given column width. */
function estimateLines(text: string, colWidth: number): number {
  if (!text) return 1;
  const charWidth = Math.max(colWidth - 2, 8); // approximate chars per line
  const lines = text.split("\n");
  let total = 0;
  for (const line of lines) {
    total += Math.max(1, Math.ceil(line.length / charWidth));
  }
  return total;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  return Array.from(
    new Set(matches.map((url) => url.replace(/[.,)\]}>]+$/g, "")).filter(Boolean)),
  );
}

function normalizeTextWithUrls(text: string): string {
  return sanitizeExcelText(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getLinkDisplayText(link: ExportTaskLink): string {
  const label = normalizeTextWithUrls(link.label ?? "");
  if (label) return label;
  const url = normalizeTextWithUrls(link.url ?? "");
  return getHostname(url) || url;
}

function formatCommentBlock(comment: ExportTaskComment): string {
  const body = normalizeTextWithUrls(comment.content ?? "");
  return sanitizeExcelText(`[${formatDateTime(comment.createdAt) || "No date"}] ${comment.author || "Unknown"}:\n${body}`);
}

function formatPendingInput(item: ExportPendingInput): string {
  const title = normalizeTextWithUrls(item.title ?? "") || "Pending input";
  const details = normalizeTextWithUrls(item.details ?? "");
  const isResolved = normalizeStatus(item.status ?? "") === "resolved" || Boolean(item.resolvedAt);
  const dueDate = formatDate(item.dueAt);
  return sanitizeExcelText(`${isResolved ? "Resolved" : "Pending"}: ${title}${dueDate ? ` (Due ${dueDate})` : ""}${details ? `\n${details}` : ""}`);
}

type PreparedTask = {
  serialNo: number;
  task: ExportTask;
  commentsText: string;
  commentsHyperlink: string | null;
  pendingInputs: string;
  pendingInputsHyperlink: string | null;
};

function prepareTasks(tasks: ExportTask[]): PreparedTask[] {
  return tasks.map((task, idx) => {
    const serialNo = idx + 1;
    const commentsText = task.commentBlocks?.length
      ? task.commentBlocks.map(formatCommentBlock).join("\n\n")
      : normalizeTextWithUrls(task.commentsText ?? "").replace(/\n{3,}/g, "\n\n");
    const pendingInputs = task.pendingInputItems?.length
      ? task.pendingInputItems.map(formatPendingInput).join("\n\n")
      : normalizeTextWithUrls(task.pendingInputs ?? "");
    const safeCommentsText = truncateExcelText(commentsText);
    const safePendingInputs = truncateExcelText(pendingInputs);
    const commentUrls = extractUrls(safeCommentsText);
    const pendingInputUrls = extractUrls(safePendingInputs);

    return {
      serialNo,
      task,
      commentsText: safeCommentsText,
      commentsHyperlink: commentUrls.length === 1 ? commentUrls[0] : null,
      pendingInputs: safePendingInputs,
      pendingInputsHyperlink: pendingInputUrls.length === 1 ? pendingInputUrls[0] : null,
    };
  });
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 11, ...WHITE_FONT };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = DARK_BLUE;
    cell.border = ALL_BORDERS;
  });
}

function safeWorksheetName(name: string): string {
  return sanitizeExcelText(name, 31)
    .replace(/[*?:\\/\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
}

function excelColumnName(index: number): string {
  let columnName = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }
  return columnName;
}

function applyReviewStatusValidation(cell: ExcelJS.Cell): void {
  cell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [`"${REVIEW_STATUS_OPTIONS}"`],
    showErrorMessage: true,
    errorTitle: "Invalid review status",
    error: "Select a review status from the list.",
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.font = { ...(cell.font ?? {}), color: { argb: "FF0F172A" } };
}

function addReviewStatusConditionalFormatting(worksheet: ExcelJS.Worksheet, ranges: Array<{ ref: string; firstCell: string }>): void {
  const addConditionalFormatting = (worksheet as unknown as {
    addConditionalFormatting?: (options: unknown) => void;
  }).addConditionalFormatting;

  if (!addConditionalFormatting) return;

  ranges.forEach(({ ref, firstCell }) => {
    addConditionalFormatting.call(worksheet, {
      ref,
      rules: [
        {
          type: "expression",
          formulae: [`${firstCell}="Not Started"`],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" }, fgColor: { argb: "FFFFC7CE" } } },
        },
        {
          type: "expression",
          formulae: [`${firstCell}="In Progress"`],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" }, fgColor: { argb: "FFFFEB9C" } } },
        },
        {
          type: "expression",
          formulae: [`${firstCell}="Review Completed"`],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" }, fgColor: { argb: "FFC6EFCE" } } },
        },
      ],
    });
  });
}

// -------------------------------------------------------------------
// Row-level highlighting
// -------------------------------------------------------------------

const ROW_OVERDUE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } };
const ROW_DUE_SOON_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
const ROW_DONE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };

// -------------------------------------------------------------------
// Main Export Function
// -------------------------------------------------------------------

export async function exportProjectToExcel(data: ExportProjectData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Team Task Manager";
  wb.created = new Date();
  const projectTime = getProjectTimeSettings({ timeZone: data.timeZone, normalWorkdayEnd: data.normalWorkdayEnd });
  const exportNow = new Date();
  const preparedTasks = prepareTasks(data.tasks);
  const maxLinkCount = Math.max(0, ...data.tasks.map((task) => task.linkItems?.length ?? 0));
  const linkColumns = Array.from({ length: maxLinkCount }, (_, index) => ({
    header: `Link ${index + 1}`,
    key: `link${index + 1}`,
    width: 28,
  }));
  const pendingInputsColumnIndex = HEADER_COLUMNS.findIndex((column) => column.key === "pendingInputs");
  const taskSheetColumns =
    pendingInputsColumnIndex >= 0
      ? [
          ...HEADER_COLUMNS.slice(0, pendingInputsColumnIndex + 1),
          ...linkColumns,
          ...HEADER_COLUMNS.slice(pendingInputsColumnIndex + 1),
        ]
      : [...HEADER_COLUMNS, ...linkColumns];

  // ========================================
  // Computed metrics
  // ========================================
  const totalTasks = data.tasks.length;
  const completedTasks = data.tasks.filter((t) => {
    const s = normalizeStatus(t.status);
    return s === "done" || s === "completed";
  }).length;
  const inProgressTasks = data.tasks.filter((t) => normalizeStatus(t.status) === "in_progress").length;
  const overdueTasks = data.tasks.filter((t) => {
    const days = getDaysRemaining(t.dueDate, projectTime.timeZone, projectTime.normalWorkdayEnd, exportNow);
    return days !== null && days < 0;
  }).length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // ========================================
  // Sheet 1 — Project Summary (Executive)
  // ========================================
  const ss = wb.addWorksheet(safeWorksheetName("Project Summary"));

  // Column widths — 6 usable columns for KPI grid (pairs of label+value)
  const SUMMARY_COLS = 14; // A–N
  for (let c = 1; c <= SUMMARY_COLS; c++) {
    ss.getColumn(c).width = 14;
  }

  // ============================================================
  // TITLE — A1:N2 merged
  // ============================================================
  ss.mergeCells("A1:N2");
  const titleCell = ss.getCell("A1");
  setSafeCellText(titleCell, data.exportScope
    ? `${data.projectName}\n${data.exportScope} Task Export`
    : `${data.projectName}\nExecutive Project Summary`);
  titleCell.font = { size: 20, bold: true, ...WHITE_FONT };
  titleCell.fill = DARK_BLUE;
  titleCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  titleCell.border = ALL_BORDERS;
  ss.getRow(1).height = 28;
  ss.getRow(2).height = 28;

  // ============================================================
  // GENERATED DATE — A3:N3 merged
  // ============================================================
  ss.mergeCells("A3:N3");
  const dateCell = ss.getCell("A3");
  const generatedLabel = `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  setSafeCellText(dateCell, data.exportScope ? `${generatedLabel} | Export Scope: ${data.exportScope}` : generatedLabel);
  dateCell.font = { size: 10, italic: true, color: { argb: "FF64748B" } };
  dateCell.alignment = { vertical: "middle", horizontal: "right" };
  ss.getRow(3).height = 20;

  if (data.projectReviewers?.length) {
    ss.mergeCells("A4:N4");
    const reviewerCell = ss.getCell("A4");
    setSafeCellText(reviewerCell, `Project Reviewer: ${data.projectReviewers.join(", ")}`);
    reviewerCell.font = { size: 11, bold: true, color: { argb: "FF334155" } };
    reviewerCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    reviewerCell.border = ALL_BORDERS;
    reviewerCell.fill = ALT_ROW_FILL;
    ss.getRow(4).height = 24;
  }

  // ============================================================
  // KPI CARDS — Row 5–6 (top 3) and Row 8–9 (bottom 3)
  // ============================================================
  // Card positions: [labelCol, valueCol] — 3 cards per row, spaced across 14 cols
  const kpiCardCols: Array<[number, number, number, number]> = [
    // [labelStartCol, labelEndCol, valueStartCol, valueEndCol]
    [1, 2, 3, 4],    // Card 1: A–B label, C–D value
    [6, 7, 8, 9],    // Card 2: F–G label, H–I value
    [11, 12, 13, 14], // Card 3: K–L label, M–N value
  ];

  const kpiCards: Array<{
    label: string;
    value: string | number;
    fill: ExcelJS.Fill;
    fontColor?: string;
  }> = [
    { label: "Total Tasks", value: totalTasks, fill: ALT_ROW_FILL },
    { label: "Completed Tasks", value: completedTasks, fill: KPI_GREEN },
    { label: "In Progress Tasks", value: inProgressTasks, fill: KPI_BLUE },
    { label: "Overdue Tasks", value: overdueTasks, fill: overdueTasks > 0 ? KPI_RED : ALT_ROW_FILL },
    { label: "Team Size", value: data.teamMembers.length, fill: ALT_ROW_FILL },
    {
      label: "Completion %",
      value: `${completionPct}%`,
      fill: completionPct >= 70 ? KPI_GREEN : completionPct >= 40 ? KPI_ORANGE : KPI_RED,
    },
  ];

  // Render two rows of 3 KPI cards
  const kpiRowStarts = [5, 8]; // Row 5 and Row 8
  kpiCards.forEach((card, idx) => {
    const rowGroup = Math.floor(idx / 3); // 0 or 1
    const colGroup = idx % 3;             // 0, 1, 2
    const baseRow = kpiRowStarts[rowGroup];
    const [lStart, lEnd, vStart, vEnd] = kpiCardCols[colGroup];

    // Label row (top of card)
    ss.mergeCells(baseRow, lStart, baseRow, vEnd);
    const labelCell = ss.getRow(baseRow).getCell(lStart);
    setSafeCellText(labelCell, card.label);
    labelCell.font = { bold: true, size: 10, color: { argb: "FF475569" } };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    labelCell.border = ALL_BORDERS;
    labelCell.fill = card.fill;

    // Value row (bottom of card)
    ss.mergeCells(baseRow + 1, lStart, baseRow + 1, vEnd);
    const valCell = ss.getRow(baseRow + 1).getCell(lStart);
    setSafeCellText(valCell, card.value);
    valCell.font = { bold: true, size: 18, color: { argb: "FF0F172A" } };
    valCell.alignment = { vertical: "middle", horizontal: "center" };
    valCell.border = ALL_BORDERS;
    valCell.fill = card.fill;

    ss.getRow(baseRow).height = 22;
    ss.getRow(baseRow + 1).height = 32;
  });

  // ============================================================
  // PROJECT STAGE BREAKDOWN — starts at row 11
  // ============================================================
  const statusStart = 11;

  // Section header
  ss.mergeCells(statusStart, 1, statusStart, 4);
  const sbTitleCell = ss.getRow(statusStart).getCell(1);
  setSafeCellText(sbTitleCell, "PROJECT STAGE BREAKDOWN");
  sbTitleCell.font = { size: 12, bold: true, ...WHITE_FONT };
  sbTitleCell.fill = DARK_BLUE;
  sbTitleCell.alignment = { vertical: "middle", horizontal: "center" };
  sbTitleCell.border = ALL_BORDERS;
  ss.getRow(statusStart).height = 28;

  // Table headers
  const sbHdrRow = statusStart + 1;
  const sbHdr = ss.getRow(sbHdrRow);
  ss.mergeCells(sbHdrRow, 1, sbHdrRow, 2);
  setSafeCellText(sbHdr.getCell(1), "Project Stage");
  ss.mergeCells(sbHdrRow, 3, sbHdrRow, 4);
  setSafeCellText(sbHdr.getCell(3), "Count");
  for (const c of [1, 3]) {
    const cell = sbHdr.getCell(c);
    cell.font = { bold: true, size: 11, ...WHITE_FONT };
    cell.fill = DARK_BLUE;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = ALL_BORDERS;
  }
  sbHdr.height = 24;

  const projectStageEntries = data.projectStages?.length
    ? computeProjectStageDistribution(
        data.tasks.map((task) => ({
          column_id: task.columnId ?? null,
          status: task.status,
        })),
        data.projectStages,
      )
    : Array.from(data.tasks.reduce<Map<string, number>>((counts, task) => {
        const label = task.stageTitle?.trim() || getWorkflowStatusLabel(task.status);
        counts.set(label, (counts.get(label) ?? 0) + 1);
        return counts;
      }, new Map()).entries()).map(([label, count]) => ({
        label,
        count,
        color: "",
        columnId: null,
        sortOrder: null,
      }));

  projectStageEntries.forEach(({ label, count }, idx) => {
    const rowNum = sbHdrRow + 1 + idx;
    const row = ss.getRow(rowNum);
    const isAlt = idx % 2 === 1;

    ss.mergeCells(rowNum, 1, rowNum, 2);
    setSafeCellText(row.getCell(1), label);
    row.getCell(1).font = { size: 11, color: { argb: "FF334155" } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(1).border = ALL_BORDERS;

    ss.mergeCells(rowNum, 3, rowNum, 4);
    setSafeCellText(row.getCell(3), count);
    row.getCell(3).font = { bold: true, size: 11 };
    row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(3).border = ALL_BORDERS;

    if (isAlt) {
      row.getCell(1).fill = ALT_ROW_FILL;
      row.getCell(3).fill = ALT_ROW_FILL;
    }
    row.height = 22;
  });

  // ============================================================
  // TEAM MEMBERS — starts after status breakdown
  // ============================================================
  const workflowStart = sbHdrRow + 1 + projectStageEntries.length + 2;

  ss.mergeCells(workflowStart, 1, workflowStart, 4);
  const workflowTitleCell = ss.getRow(workflowStart).getCell(1);
  setSafeCellText(workflowTitleCell, "WORKFLOW STATUS BREAKDOWN");
  workflowTitleCell.font = { size: 12, bold: true, ...WHITE_FONT };
  workflowTitleCell.fill = DARK_BLUE;
  workflowTitleCell.alignment = { vertical: "middle", horizontal: "center" };
  workflowTitleCell.border = ALL_BORDERS;
  ss.getRow(workflowStart).height = 28;

  const workflowHdrRow = workflowStart + 1;
  const workflowHdr = ss.getRow(workflowHdrRow);
  ss.mergeCells(workflowHdrRow, 1, workflowHdrRow, 2);
  setSafeCellText(workflowHdr.getCell(1), "Workflow Status");
  ss.mergeCells(workflowHdrRow, 3, workflowHdrRow, 4);
  setSafeCellText(workflowHdr.getCell(3), "Count");
  for (const c of [1, 3]) {
    const cell = workflowHdr.getCell(c);
    cell.font = { bold: true, size: 11, ...WHITE_FONT };
    cell.fill = DARK_BLUE;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = ALL_BORDERS;
  }
  workflowHdr.height = 24;

  const workflowCounts = data.tasks.reduce<Map<string, number>>((counts, task) => {
    const label = getWorkflowStatusLabel(task.status);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  }, new Map());
  const workflowEntries = Array.from(workflowCounts.entries());
  workflowEntries.forEach(([label, count], idx) => {
    const rowNum = workflowHdrRow + 1 + idx;
    const row = ss.getRow(rowNum);
    const isAlt = idx % 2 === 1;

    ss.mergeCells(rowNum, 1, rowNum, 2);
    setSafeCellText(row.getCell(1), label);
    row.getCell(1).font = { size: 11, color: { argb: "FF334155" } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(1).border = ALL_BORDERS;

    ss.mergeCells(rowNum, 3, rowNum, 4);
    setSafeCellText(row.getCell(3), count);
    row.getCell(3).font = { bold: true, size: 11 };
    row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(3).border = ALL_BORDERS;

    if (isAlt) {
      row.getCell(1).fill = ALT_ROW_FILL;
      row.getCell(3).fill = ALT_ROW_FILL;
    }
    row.height = 22;
  });

  const teamStart = workflowHdrRow + 1 + workflowEntries.length + 2;

  // Section header
  ss.mergeCells(teamStart, 1, teamStart, 4);
  const tmTitleCell = ss.getRow(teamStart).getCell(1);
  setSafeCellText(tmTitleCell, "TEAM MEMBERS");
  tmTitleCell.font = { size: 12, bold: true, ...WHITE_FONT };
  tmTitleCell.fill = DARK_BLUE;
  tmTitleCell.alignment = { vertical: "middle", horizontal: "center" };
  tmTitleCell.border = ALL_BORDERS;
  ss.getRow(teamStart).height = 28;

  // Table header
  const tmHdrRow = teamStart + 1;
  ss.mergeCells(tmHdrRow, 1, tmHdrRow, 4);
  const tmHdrCell = ss.getRow(tmHdrRow).getCell(1);
  setSafeCellText(tmHdrCell, "Member Name");
  tmHdrCell.font = { bold: true, size: 11, ...WHITE_FONT };
  tmHdrCell.fill = DARK_BLUE;
  tmHdrCell.alignment = { vertical: "middle", horizontal: "center" };
  tmHdrCell.border = ALL_BORDERS;
  ss.getRow(tmHdrRow).height = 24;

  // One member per row
  const memberList = data.teamMembers.length > 0 ? data.teamMembers : ["—"];
  memberList.forEach((name, idx) => {
    const rowNum = tmHdrRow + 1 + idx;
    const row = ss.getRow(rowNum);
    const isAlt = idx % 2 === 1;

    ss.mergeCells(rowNum, 1, rowNum, 4);
    setSafeCellText(row.getCell(1), name);
    row.getCell(1).font = { size: 11, color: { argb: "FF334155" } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(1).border = ALL_BORDERS;
    if (isAlt) row.getCell(1).fill = ALT_ROW_FILL;
    row.height = 20;
  });

  // Freeze title rows
  ss.views = [{ state: "frozen", ySplit: 3 }];

  // ========================================
  // Sheet 2 — Tasks
  // ========================================
  const ts = wb.addWorksheet(safeWorksheetName("Tasks"));

  // Define columns
  ts.columns = taskSheetColumns;

  // Style header row
  const headerRow = ts.getRow(1);
  styleHeaderRow(headerRow);
  headerRow.height = Math.min(headerRow.height ?? 32, 36);

  // Freeze header row + enable autofilter
  ts.views = [{ state: "frozen", ySplit: 1 }];
  ts.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: taskSheetColumns.length },
  };

  // Track max content length per column for auto-fit
  const maxLengths: Record<string, number> = {};
  taskSheetColumns.forEach((col) => {
    maxLengths[col.key] = col.header.length;
  });

  // Data rows
  preparedTasks.forEach((prepared, idx) => {
    const task = prepared.task;
    const norm = normalizeStatus(task.status);
    const daysRemaining = getDaysRemaining(task.dueDate, projectTime.timeZone, projectTime.normalWorkdayEnd, exportNow);
    const workflowProgress = getProgress(task.status);

    const rowValues: Record<string, string | number> = {
      serialNo: prepared.serialNo,
      title: sanitizeExcelText(task.title),
      stageTitle: sanitizeExcelText(task.stageTitle ?? task.column ?? getWorkflowStatusLabel(task.status)),
      workflowStatus: sanitizeExcelText(getWorkflowStatusLabel(task.status)),
      workflowProgress,
      description: truncateExcelText(task.description ?? ""),
      requiredBy: sanitizeExcelText(task.requiredBy ?? ""),
      assignees: sanitizeExcelText(task.assignees || "Unassigned"),
      createdBy: sanitizeExcelText(task.createdBy || "Unknown"),
      startDate: formatDate(task.startDate),
      dueDate: formatDate(task.dueDate),
      expectedDate: formatDate(task.expectedDate ?? null),
      completedDate: formatDate(task.completedDate ?? null),
      reviewedDate: formatDate(task.reviewedDate ?? null),
      issuedDate: formatDate(task.issuedDate ?? null),
      reviewCompletedBy: sanitizeExcelText(task.reviewCompletedBy ?? ""),
      documentReferenceUrl: sanitizeExcelText(task.documentReferenceUrl ?? ""),
      draftReviewStartDate: formatDate(task.draftReviewStartDate ?? null),
      reviewDueDate: formatDate(task.reviewDueDate ?? null),
      createdAt: formatDate(task.createdAt),
      updatedAt: formatDate(task.updatedAt),
      commentsCount: task.commentsCount,
      commentsText: prepared.commentsText,
      pendingInputs: prepared.pendingInputs,
      nextAction: sanitizeExcelText(task.nextAction ?? ""),
      targetRevisionDate: sanitizeExcelText(task.targetRevisionDate ?? ""),
      targetApprovalDate: sanitizeExcelText(task.targetApprovalDate ?? ""),
      fleetManagementReviewDate: "Not Started",
      marineStandardsReviewDate: "Not Started",
      talentDevelopmentReviewDate: "Not Started",
      projectManagementShipyardTeamReviewStatus: "Not Started",
      attachmentCount: task.attachmentCount,
      daysRemaining: daysRemaining !== null ? daysRemaining : "",
    };
    linkColumns.forEach((column, linkIndex) => {
      const link = task.linkItems?.[linkIndex];
      rowValues[column.key] = link ? sanitizeExcelText(getLinkDisplayText(link), 500) : "";
    });

    const row = ts.addRow(rowValues);
    if (prepared.commentsHyperlink) {
      const commentsCell = row.getCell("commentsText");
      setSafeHyperlinkCell(commentsCell, prepared.commentsText, prepared.commentsHyperlink);
    }
    if (prepared.pendingInputsHyperlink) {
      const pendingInputsCell = row.getCell("pendingInputs");
      setSafeHyperlinkCell(pendingInputsCell, prepared.pendingInputs, prepared.pendingInputsHyperlink);
    }
    if (task.documentReferenceUrl) {
      setSafeHyperlinkCell(row.getCell("documentReferenceUrl"), task.documentReferenceUrl, task.documentReferenceUrl);
    }
    linkColumns.forEach((column, linkIndex) => {
      const link = task.linkItems?.[linkIndex];
      if (!link) return;

      const linkCell = row.getCell(column.key);
      setSafeHyperlinkCell(linkCell, getLinkDisplayText(link), link.url);
      linkCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    });

    // Update max lengths for auto-fit
    for (const col of taskSheetColumns) {
      const val = String(rowValues[col.key] ?? "");
      if (val.length > (maxLengths[col.key] ?? 0)) {
        maxLengths[col.key] = val.length;
      }
    }

    // ---- Base alignment: vertical middle, left for text ----
    row.alignment = { vertical: "middle", horizontal: "left", wrapText: false };

    // ---- Enable wrapText for long-content columns ----
    for (const col of taskSheetColumns) {
      if (WRAP_KEYS.has(col.key) || col.key.startsWith("link")) {
        const cell = row.getCell(col.key);
        cell.alignment = { vertical: col.key.startsWith("link") ? "top" : "middle", horizontal: "left", wrapText: true };
      }
    }

    // ---- Dynamic row height based on wrapped content ----
    let maxLines = 1;
    for (const col of taskSheetColumns) {
      if (WRAP_KEYS.has(col.key) || col.key.startsWith("link")) {
        const text = String(rowValues[col.key] ?? "");
        const colWidth = COL_MAX_WIDTH[col.key] ?? col.width;
        const lines = estimateLines(text, colWidth);
        if (lines > maxLines) maxLines = lines;
      }
    }
    row.height = Math.min(Math.max(20, maxLines * 15), 60);

    // ---- Alternating row shading (behind other fills) ----
    if (idx % 2 === 1) {
      for (let colIndex = 1; colIndex <= taskSheetColumns.length; colIndex += 1) {
        const cell = row.getCell(colIndex);
        cell.fill = ALT_ROW_FILL;
      }
    }

    // ---- Stage and workflow status cell color ----
    const stageCell = row.getCell("stageTitle");
    if (task.stageColor) {
      stageCell.font = { ...(stageCell.font ?? {}), color: { argb: `FF${task.stageColor.replace("#", "").toUpperCase()}` }, bold: true };
    }
    stageCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    const statusCell = row.getCell("workflowStatus");
    const statusFill = STATUS_FILLS[norm];
    if (statusFill) statusCell.fill = statusFill as ExcelJS.Fill;
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    // ---- Workflow progress cell ----
    const progressCell = row.getCell("workflowProgress");
    progressCell.alignment = { horizontal: "center", vertical: "middle" };
    progressCell.numFmt = "0";

    // ---- Numeric cells center ----
    row.getCell("serialNo").alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("commentsCount").alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("attachmentCount").alignment = { horizontal: "center", vertical: "middle" };

    // ---- Days Remaining: conditional fill + center ----
    const daysCell = row.getCell("daysRemaining");
    daysCell.alignment = { horizontal: "center", vertical: "middle" };
    if (daysRemaining !== null) {
      if (daysRemaining < 0) {
        daysCell.fill = DAYS_RED;
      } else if (daysRemaining === 0) {
        daysCell.fill = DAYS_ORANGE;
      } else {
        daysCell.fill = DAYS_GREEN;
      }
    }

    // ---- Row-level highlighting ----
    const isDone = norm === "done" || norm === "completed";
    const isOverdue = daysRemaining !== null && daysRemaining < 0;
    const isDueSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3;

    // Determine cells to protect from row-level fill overwrite
    const daysColKey = "daysRemaining";

    if (isDone) {
      for (let colIndex = 1; colIndex <= taskSheetColumns.length; colIndex += 1) {
        const cell = row.getCell(colIndex);
        if (cell.address === statusCell.address) continue; // protect status
        if (row.getCell(daysColKey).address === cell.address) continue; // protect days remaining
        cell.fill = ROW_DONE_FILL;
      }
    } else if (isOverdue) {
      for (let colIndex = 1; colIndex <= taskSheetColumns.length; colIndex += 1) {
        const cell = row.getCell(colIndex);
        if (cell.address === statusCell.address) continue;
        if (row.getCell(daysColKey).address === cell.address) continue;
        cell.fill = ROW_OVERDUE_FILL;
      }
      statusCell.fill = STATUS_FILLS.overdue as ExcelJS.Fill;
      statusCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      setSafeCellText(statusCell, "Overdue");
    } else if (isDueSoon) {
      for (let colIndex = 1; colIndex <= taskSheetColumns.length; colIndex += 1) {
        const cell = row.getCell(colIndex);
        if (cell.address === statusCell.address) continue;
        if (row.getCell(daysColKey).address === cell.address) continue;
        cell.fill = ROW_DUE_SOON_FILL;
      }
    }

    // ---- Cell borders ----
    for (let colIndex = 1; colIndex <= taskSheetColumns.length; colIndex += 1) {
      row.getCell(colIndex).border = ALL_BORDERS;
    }

    REVIEW_STATUS_COLUMN_KEYS.forEach((key) => {
      applyReviewStatusValidation(row.getCell(key));
    });

  });

  if (preparedTasks.length > 0) {
    const reviewStatusRanges = REVIEW_STATUS_COLUMN_KEYS
      .map((key) => {
        const columnIndex = taskSheetColumns.findIndex((column) => column.key === key) + 1;
        if (columnIndex <= 0) return null;
        const columnName = excelColumnName(columnIndex);
        return {
          ref: `${columnName}2:${columnName}${preparedTasks.length + 1}`,
          firstCell: `${columnName}2`,
        };
      })
      .filter((range): range is { ref: string; firstCell: string } => Boolean(range));

    addReviewStatusConditionalFormatting(ts, reviewStatusRanges);
  }

  // ---- Auto-fit column widths (respect caps) ----
  for (const col of taskSheetColumns) {
    const tsCol = ts.getColumn(col.key);
    const maxLen = maxLengths[col.key] ?? col.width;
    const cap = col.key.startsWith("link") ? col.width : COL_MAX_WIDTH[col.key] ?? 50;
    // Add padding of 4 chars, clamp between header width and cap
    tsCol.width = Math.min(cap, Math.max(col.header.length + 4, maxLen + 4));
  }

  // ---- Generate and download ----
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const today = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeExcelText(data.projectName).replace(/[^a-zA-Z0-9_\- ]/g, "_").replace(/\s+/g, "_");
  const safeScope = data.exportScope
    ? sanitizeExcelText(data.exportScope).replace(/[^a-zA-Z0-9_\- ]/g, "_").replace(/\s+/g, "_")
    : null;
  const filename = safeScope
    ? `${safeName}_${safeScope}_Tasks_${today}.xlsx`
    : `${safeName}_Tasks_${today}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
