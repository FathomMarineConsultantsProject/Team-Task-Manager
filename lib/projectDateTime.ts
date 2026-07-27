export type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

export type TimeOnlyParts = {
  hour: number;
  minute: number;
  second: number;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export const DEFAULT_PROJECT_TIME_ZONE = "Asia/Kolkata";
export const DEFAULT_PROJECT_WORKDAY_START = "09:00";
export const DEFAULT_PROJECT_WORKDAY_END = "19:00";

export type ProjectTimeSettings = {
  timeZone: string;
  normalWorkdayStart: string;
  normalWorkdayEnd: string;
};

export function getProjectTimeSettings(input?: {
  timeZone?: string | null;
  normalWorkdayStart?: string | null;
  normalWorkdayEnd?: string | null;
}): ProjectTimeSettings {
  let timeZone = input?.timeZone?.trim() || DEFAULT_PROJECT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    timeZone = DEFAULT_PROJECT_TIME_ZONE;
  }
  return {
    timeZone,
    normalWorkdayStart: parseTimeOnly(input?.normalWorkdayStart) ? input!.normalWorkdayStart! : DEFAULT_PROJECT_WORKDAY_START,
    normalWorkdayEnd: parseTimeOnly(input?.normalWorkdayEnd) ? input!.normalWorkdayEnd! : DEFAULT_PROJECT_WORKDAY_END,
  };
}

export function parseDateOnly(value: unknown): DateOnlyParts | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseTimeOnly(value: unknown): TimeOnlyParts | null {
  if (typeof value !== "string") return null;
  const match = TIME_ONLY_PATTERN.exec(value);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };
}

export function isDateOnly(value: unknown): value is string {
  return parseDateOnly(value) !== null;
}

export function compareDateOnly(left: string, right: string): number {
  const leftParts = parseDateOnly(left);
  const rightParts = parseDateOnly(right);
  if (!leftParts || !rightParts) throw new Error("Expected valid YYYY-MM-DD values.");
  return (
    Date.UTC(leftParts.year, leftParts.month - 1, leftParts.day)
    - Date.UTC(rightParts.year, rightParts.month - 1, rightParts.day)
  );
}

export function addDaysToDateOnly(value: string, days: number): string {
  const parts = parseDateOnly(value);
  if (!parts) throw new Error("Expected a valid YYYY-MM-DD value.");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function listDateOnlyRange(start: string, end: string, limit = 366): string[] {
  if (compareDateOnly(end, start) < 0) throw new Error("End date cannot be earlier than start date.");
  const dates: string[] = [];
  for (let date = start; compareDateOnly(date, end) <= 0; date = addDaysToDateOnly(date, 1)) {
    dates.push(date);
    if (dates.length > limit) throw new Error(`Working-date ranges are limited to ${limit} days.`);
  }
  return dates;
}

function zonedParts(instant: Date, timeZone: string) {
  const values: Record<string, number> = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).forEach((part) => {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  });
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getProjectLocalDate(timeZone: string, instant = new Date()): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function projectLocalDateTimeToUtc(
  dateOnly: string,
  localTime: string,
  timeZone: string,
): Date {
  const date = parseDateOnly(dateOnly);
  const time = parseTimeOnly(localTime);
  if (!date || !time) throw new Error("Expected valid project-local date and time.");

  const targetWallClock = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    time.second,
  );
  let candidate = targetWallClock;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(candidate), timeZone);
    const renderedWallClock = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    candidate += targetWallClock - renderedWallClock;
  }

  const result = new Date(candidate);
  const rendered = zonedParts(result, timeZone);
  if (
    rendered.year !== date.year
    || rendered.month !== date.month
    || rendered.day !== date.day
    || rendered.hour !== time.hour
    || rendered.minute !== time.minute
    || rendered.second !== time.second
  ) {
    throw new Error("Project-local date/time does not exist in the selected timezone.");
  }
  return result;
}

export function getEffectiveDueAt(
  dueDate: string,
  timeZone: string,
  cutoffLocalTime = DEFAULT_PROJECT_WORKDAY_END,
): Date {
  return projectLocalDateTimeToUtc(dueDate, cutoffLocalTime, timeZone);
}

export function getEffectiveTaskDueAt({
  dueDate,
  timeZone,
  workdayEnd = DEFAULT_PROJECT_WORKDAY_END,
}: {
  dueDate: string | null | undefined;
  timeZone?: string | null;
  workdayEnd?: string | null;
}): Date | null {
  if (!isDateOnly(dueDate)) return null;
  const settings = getProjectTimeSettings({ timeZone, normalWorkdayEnd: workdayEnd });
  return projectLocalDateTimeToUtc(dueDate, settings.normalWorkdayEnd, settings.timeZone);
}

export type TaskDueState = "no_due_date" | "completed" | "future" | "due_today" | "overdue";

export function getTaskDueState({
  dueDate,
  completedAt,
  now = new Date(),
  timeZone,
  workdayEnd,
}: {
  dueDate: string | null | undefined;
  completedAt?: string | null;
  now?: Date;
  timeZone?: string | null;
  workdayEnd?: string | null;
}): {
  state: TaskDueState;
  effectiveDueAt: Date | null;
  remainingMs: number | null;
} {
  const settings = getProjectTimeSettings({ timeZone, normalWorkdayEnd: workdayEnd });
  const effectiveDueAt = getEffectiveTaskDueAt({
    dueDate,
    timeZone: settings.timeZone,
    workdayEnd: settings.normalWorkdayEnd,
  });
  if (!effectiveDueAt) return { state: "no_due_date", effectiveDueAt: null, remainingMs: null };
  const remainingMs = effectiveDueAt.getTime() - now.getTime();
  if (completedAt) return { state: "completed", effectiveDueAt, remainingMs };
  if (remainingMs <= 0) return { state: "overdue", effectiveDueAt, remainingMs };
  return {
    state: dueDate === getProjectLocalDate(settings.timeZone, now) ? "due_today" : "future",
    effectiveDueAt,
    remainingMs,
  };
}

export function getSignedDaysRemaining({
  dueDate,
  now = new Date(),
  timeZone,
  workdayEnd,
}: {
  dueDate: string | null | undefined;
  now?: Date;
  timeZone?: string | null;
  workdayEnd?: string | null;
}): number | null {
  if (!isDateOnly(dueDate)) return null;
  const settings = getProjectTimeSettings({ timeZone, normalWorkdayEnd: workdayEnd });
  const today = getProjectLocalDate(settings.timeZone, now);
  const calendarDays = Math.round(compareDateOnly(dueDate, today) / 86_400_000);
  if (calendarDays > 0) return calendarDays;
  if (calendarDays < 0) return calendarDays - 1;
  const dueAt = getEffectiveTaskDueAt({ dueDate, timeZone: settings.timeZone, workdayEnd: settings.normalWorkdayEnd });
  return dueAt && now.getTime() >= dueAt.getTime() ? -1 : 0;
}

export function getProjectRangeUtc({
  startDate,
  endDateExclusive,
  timeZone,
}: {
  startDate: string;
  endDateExclusive: string;
  timeZone?: string | null;
}): { start: Date; endExclusive: Date } {
  if (!isDateOnly(startDate) || !isDateOnly(endDateExclusive) || compareDateOnly(endDateExclusive, startDate) < 0) {
    throw new Error("Expected a valid half-open project date range.");
  }
  const settings = getProjectTimeSettings({ timeZone });
  return {
    start: projectLocalDateTimeToUtc(startDate, "00:00", settings.timeZone),
    endExclusive: projectLocalDateTimeToUtc(endDateExclusive, "00:00", settings.timeZone),
  };
}

export function formatProjectDate(
  dateOnly: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "2-digit" },
): string {
  const date = projectLocalDateTimeToUtc(dateOnly, "12:00", timeZone);
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
}
