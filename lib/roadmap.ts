export type RoadmapTask = {
  id: string;
  title: string | null;
  status?: string | null;
  assigned_to?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  assigned_user?: {
    id: string;
    name: string | null;
  } | null;
  project_id?: string | null;
  updated_at?: string | null;
  created_at: string | null;
  completed_at: string | null;
  assignees?: { id: string; name: string | null }[];
};

export type RoadmapProject = {
  id: string;
  name: string | null;
  tasks: RoadmapTask[];
};

export type RoadmapWeek = {
  start: Date;
  end: Date;
  label: string;
};

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parse date-only strings (YYYY-MM-DD) as local calendar midnight to avoid UTC day shifts. */
function parseRoadmapCalendarDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("T")) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  return start;
}

export function endOfWeek(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getWeekDayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function getWeekDays(week: RoadmapWeek) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(week.start);
    date.setDate(date.getDate() + index);

    return {
      date,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      dayNumber: date.getDate(),
      key: String(date.getTime()),
    };
  });
}

export function formatWeekLabel(start: Date, end: Date) {
  const startMonth = start.toLocaleDateString(undefined, { month: "long" });
  const endMonth = end.toLocaleDateString(undefined, { month: "long" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }

  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }

  return `${startMonth} ${startDay}, ${start.getFullYear()} - ${endMonth} ${endDay}, ${end.getFullYear()}`;
}

/** Anchor date for roadmap placement: start_date when set, otherwise created_at (local calendar day). */
export function getTaskDate(task: RoadmapTask): Date | null {
  if (task.start_date) {
    return parseRoadmapCalendarDate(task.start_date);
  }

  if (task.created_at) {
    const parsed = parseRoadmapCalendarDate(task.created_at);
    if (!parsed) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }

  return null;
}

export function isSameWeek(date: Date, week: RoadmapWeek): boolean {
  const weekStart = startOfWeek(week.start);
  const dateWeekStart = startOfWeek(date);
  return dateWeekStart.getTime() === weekStart.getTime();
}

/** Returns the calendar anchor used for a task (start_date, else created_at). Week is ignored. */
export function getTaskDateForWeek(task: RoadmapTask, _week: RoadmapWeek): Date | null {
  void _week;
  return getTaskDate(task);
}

export function getAvailableWeeks(projects: RoadmapProject[]): RoadmapWeek[] {
  const weeksByStart = new Map<number, RoadmapWeek>();

  projects.forEach((project) => {
    project.tasks.forEach((task) => {
      const anchor = getTaskDate(task);
      if (!anchor) {
        return;
      }

      const start = startOfWeek(anchor);
      const startTime = start.getTime();

      if (weeksByStart.has(startTime)) {
        return;
      }

      const end = endOfWeek(start);
      weeksByStart.set(startTime, {
        start,
        end,
        label: formatWeekLabel(start, end),
      });
    });
  });

  return Array.from(weeksByStart.values()).sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function isSameWeekStart(left: Date | null, right: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}

export function getWeekLabelForDate(date: Date) {
  const weekStart = startOfWeek(date);
  return formatWeekLabel(weekStart, endOfWeek(weekStart));
}

// ── Month-level helpers ──────────────────────────────

export type RoadmapMonth = {
  start: Date;
  end: Date;
  label: string;
  key: string;
  weeksInMonth: RoadmapWeek[];
};

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Get weeks within a single month */
export function getWeeksInMonth(monthStart: Date): RoadmapWeek[] {
  const weeks: RoadmapWeek[] = [];
  const monthEnd = endOfMonth(monthStart);
  let cursor = startOfWeek(new Date(monthStart));

  while (cursor <= monthEnd) {
    const weekEnd = endOfWeek(cursor);
    weeks.push({
      start: new Date(cursor),
      end: weekEnd,
      label: formatWeekLabel(cursor, weekEnd),
    });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

/** Build a range of months around today */
export function getMonthRange(monthsBefore = 1, monthsAfter = 5): RoadmapMonth[] {
  const today = new Date();
  const months: RoadmapMonth[] = [];

  for (let offset = -monthsBefore; offset <= monthsAfter; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const s = startOfMonth(d);
    const e = endOfMonth(d);
    months.push({
      start: s,
      end: e,
      label: formatMonthLabel(d),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      weeksInMonth: getWeeksInMonth(s),
    });
  }
  return months;
}

// ── Quarter-level helpers ────────────────────────────

export type RoadmapQuarter = {
  start: Date;
  end: Date;
  label: string;
  key: string;
  months: RoadmapMonth[];
};

export function getQuarterRange(quartersBefore = 0, quartersAfter = 3): RoadmapQuarter[] {
  const today = new Date();
  const currentQ = Math.floor(today.getMonth() / 3);
  const quarters: RoadmapQuarter[] = [];

  for (let offset = -quartersBefore; offset <= quartersAfter; offset++) {
    const q = currentQ + offset;
    const year = today.getFullYear() + Math.floor(q / 4);
    const qIndex = ((q % 4) + 4) % 4;
    const startMonth = qIndex * 3;
    const qStart = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const qEnd = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    const qLabel = `Q${qIndex + 1} ${year}`;

    const months: RoadmapMonth[] = [];
    for (let m = 0; m < 3; m++) {
      const mDate = new Date(year, startMonth + m, 1);
      months.push({
        start: startOfMonth(mDate),
        end: endOfMonth(mDate),
        label: formatMonthLabel(mDate),
        key: `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, "0")}`,
        weeksInMonth: getWeeksInMonth(startOfMonth(mDate)),
      });
    }

    quarters.push({ start: qStart, end: qEnd, label: qLabel, key: `${year}-Q${qIndex + 1}`, months });
  }
  return quarters;
}

/** Calculate how far (0-1) a date falls within a span */
export function getPositionInRange(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const total = rangeEnd.getTime() - rangeStart.getTime();
  if (total <= 0) return 0;
  const pos = (date.getTime() - rangeStart.getTime()) / total;
  return Math.max(0, Math.min(1, pos));
}

/** Get task bar span as { left%, width% } within a date range */
export function getTaskBarSpan(
  taskStart: Date | null,
  taskEnd: Date | null,
  rangeStart: Date,
  rangeEnd: Date
): { left: number; width: number } | null {
  if (!taskStart && !taskEnd) return null;
  const effectiveStart = taskStart ?? taskEnd!;
  const effectiveEnd = taskEnd ?? taskStart!;
  if (effectiveEnd < rangeStart || effectiveStart > rangeEnd) return null;

  const clampedStart = effectiveStart < rangeStart ? rangeStart : effectiveStart;
  const clampedEnd = effectiveEnd > rangeEnd ? rangeEnd : effectiveEnd;

  const left = getPositionInRange(clampedStart, rangeStart, rangeEnd) * 100;
  const right = getPositionInRange(clampedEnd, rangeStart, rangeEnd) * 100;
  const width = Math.max(right - left, 1.5); // min 1.5% so dots are visible

  return { left, width };
}