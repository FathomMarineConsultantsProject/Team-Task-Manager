"use client";

import ExcelJS from "exceljs";

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

const HEADER_COLUMNS = [
  { header: "S.No", key: "serialNo", width: 8 },
  { header: "Task Name", key: "title", width: 45 },
  { header: "Description", key: "description", width: 60 },
  { header: "Status", key: "status", width: 16 },
  { header: "Assigned To", key: "assignees", width: 35 },
  { header: "Created By", key: "createdBy", width: 20 },
  { header: "Start Date", key: "startDate", width: 14 },
  { header: "Due Date", key: "dueDate", width: 14 },
  { header: "Draft Review Start Date", key: "draftReviewStartDate", width: 22 },
  { header: "Review Due Date", key: "reviewDueDate", width: 18 },
  { header: "Progress %", key: "progress", width: 12 },
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

function getDaysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
    const days = getDaysRemaining(t.dueDate);
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
  // STATUS BREAKDOWN — starts at row 11
  // ============================================================
  const statusStart = 11;

  // Section header
  ss.mergeCells(statusStart, 1, statusStart, 4);
  const sbTitleCell = ss.getRow(statusStart).getCell(1);
  setSafeCellText(sbTitleCell, "STATUS BREAKDOWN");
  sbTitleCell.font = { size: 12, bold: true, ...WHITE_FONT };
  sbTitleCell.fill = DARK_BLUE;
  sbTitleCell.alignment = { vertical: "middle", horizontal: "center" };
  sbTitleCell.border = ALL_BORDERS;
  ss.getRow(statusStart).height = 28;

  // Table headers
  const sbHdrRow = statusStart + 1;
  const sbHdr = ss.getRow(sbHdrRow);
  ss.mergeCells(sbHdrRow, 1, sbHdrRow, 2);
  setSafeCellText(sbHdr.getCell(1), "Status");
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

  // Table data
  const statusCounts: Record<string, number> = {};
  data.tasks.forEach((t) => {
    const label = formatStatusLabel(t.status);
    statusCounts[label] = (statusCounts[label] ?? 0) + 1;
  });

  const statusEntries = Object.entries(statusCounts);
  statusEntries.forEach(([label, count], idx) => {
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
  const teamStart = sbHdrRow + 1 + statusEntries.length + 2;

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
  styleHeaderRow(ts.getRow(1));

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
    const daysRemaining = getDaysRemaining(task.dueDate);
    const progress = getProgress(task.status);

    const rowValues: Record<string, string | number> = {
      serialNo: prepared.serialNo,
      title: sanitizeExcelText(task.title),
      description: truncateExcelText(task.description ?? ""),
      status: sanitizeExcelText(formatStatusLabel(task.status)),
      assignees: sanitizeExcelText(task.assignees || "Unassigned"),
      createdBy: sanitizeExcelText(task.createdBy || "Unknown"),
      startDate: formatDate(task.startDate),
      dueDate: formatDate(task.dueDate),
      draftReviewStartDate: formatDate(task.draftReviewStartDate ?? null),
      reviewDueDate: formatDate(task.reviewDueDate ?? null),
      progress: progress,
      createdAt: formatDate(task.createdAt),
      updatedAt: formatDate(task.updatedAt),
      commentsCount: task.commentsCount,
      commentsText: prepared.commentsText,
      pendingInputs: prepared.pendingInputs,
      nextAction: sanitizeExcelText(task.nextAction ?? ""),
      targetRevisionDate: sanitizeExcelText(task.targetRevisionDate ?? ""),
      targetApprovalDate: sanitizeExcelText(task.targetApprovalDate ?? ""),
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
    row.height = Math.min(Math.max(20, maxLines * 15), 150);

    // ---- Alternating row shading (behind other fills) ----
    if (idx % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = ALT_ROW_FILL;
      });
    }

    // ---- Status cell color ----
    const statusCell = row.getCell("status");
    const statusFill = STATUS_FILLS[norm];
    if (statusFill) statusCell.fill = statusFill as ExcelJS.Fill;
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    // ---- Progress cell ----
    const progressCell = row.getCell("progress");
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
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.address === statusCell.address) return; // protect status
        if (row.getCell(daysColKey).address === cell.address) return; // protect days remaining
        cell.fill = ROW_DONE_FILL;
      });
    } else if (isOverdue) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.address === statusCell.address) return;
        if (row.getCell(daysColKey).address === cell.address) return;
        cell.fill = ROW_OVERDUE_FILL;
      });
      statusCell.fill = STATUS_FILLS.overdue as ExcelJS.Fill;
      statusCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      setSafeCellText(statusCell, "Overdue");
    } else if (isDueSoon) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.address === statusCell.address) return;
        if (row.getCell(daysColKey).address === cell.address) return;
        cell.fill = ROW_DUE_SOON_FILL;
      });
    }

    // ---- Cell borders ----
    row.eachCell((cell) => {
      cell.border = ALL_BORDERS;
    });
  });

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
