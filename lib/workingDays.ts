export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function addWorkingDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let remaining = Math.max(0, Math.floor(days));

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) {
      remaining -= 1;
    }
  }

  return result;
}

export function workingDaysUntil(targetDate: Date, fromDate = new Date()): number {
  const start = new Date(fromDate);
  const target = new Date(targetDate);
  const direction = target.getTime() >= start.getTime() ? 1 : -1;
  let cursor = new Date(start);
  let days = 0;

  while ((target.getTime() - cursor.getTime()) * direction > 0) {
    cursor.setDate(cursor.getDate() + direction);
    if (!isWeekend(cursor)) {
      days += direction;
    }
  }

  return days;
}
