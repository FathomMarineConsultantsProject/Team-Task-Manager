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