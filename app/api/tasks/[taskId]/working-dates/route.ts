import { addDaysToDateOnly, compareDateOnly, isDateOnly, projectLocalDateTimeToUtc } from "@/lib/projectDateTime";
import { historicalReasonRequiredResponse } from "@/lib/scheduleChangeReason";
import { getAuthenticatedUser, jsonNoStore } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type UpdateWorkingDatesRequest = {
  dates?: string[];
  workingDates?: string[];
  reason?: string;
  title?: string;
  description?: string | null;
};

const isHistoricalReasonError = (error: { code?: string; message?: string; details?: string } | null) => Boolean(
  error?.code === "P0003"
  && (
    error.details === "HISTORICAL_REASON_REQUIRED"
    || error.message === "A reason is required for a historical schedule correction."
  )
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "P0003" || code === "23505") return 409;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

function logOptionalQueryError(req: Request, taskId: string, query: string, error: unknown) {
  console.error("Optional working-dates query failed", {
    taskId,
    query,
    authorizationPresent: Boolean(req.headers.get("authorization")),
    error,
  });
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to view task working dates." }, 401);

    const { data, error } = await adminClient.rpc("get_task_working_schedule", {
      p_task_id: taskId,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    const schedule = (data ?? {}) as {
      dates?: string[];
      timeZone?: string;
      normalWorkdayStart?: string;
      normalWorkdayEnd?: string;
      todayLocalDate?: string;
      currentExtension?: unknown;
    };
    const dates = Array.isArray(schedule.dates) ? schedule.dates : [];
    const selectedDates = new Set(dates);
    let extensionRows: {
      work_date: string;
      extended_until_local_time: string;
      reason: string | null;
    }[] | null = null;
    let extensionError: unknown = null;
    try {
      const result = await adminClient
        .from("task_workday_extensions")
        .select("work_date, extended_until_local_time, reason")
        .eq("task_id", taskId)
        .is("cancelled_at", null)
        .order("work_date", { ascending: true });
      extensionRows = result.data;
      extensionError = result.error;
    } catch (error) {
      extensionError = error;
    }
    if (extensionError) {
      logOptionalQueryError(req, taskId, "task_workday_extensions", extensionError);
    }

    const extensions = (extensionError ? [] : extensionRows ?? [])
      .filter((row) => selectedDates.has(row.work_date))
      .map((row) => ({
        workDate: row.work_date,
        extendedUntilLocalTime: row.extended_until_local_time,
        reason: row.reason,
      }));

    type WorkingDateAuditRow = {
      id: string;
      work_date: string;
      action: "added" | "removed";
      actor_id: string | null;
      reason: string | null;
      created_at: string;
    };
    type ExtensionAuditRow = {
      id: string;
      work_date: string;
      action: "created" | "updated" | "cancelled";
      old_extended_until_local_time: string | null;
      new_extended_until_local_time: string | null;
      actor_id: string | null;
      reason: string | null;
      created_at: string;
    };

    const [workingDateAuditResult, extensionAuditResult] = await Promise.all([
      adminClient
        .from("task_working_date_audit")
        .select("id, work_date, action, actor_id, reason, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(500),
      adminClient
        .from("task_workday_extension_audit")
        .select("id, work_date, action, old_extended_until_local_time, new_extended_until_local_time, actor_id, reason, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (workingDateAuditResult.error) logOptionalQueryError(req, taskId, "task_working_date_audit", workingDateAuditResult.error);
    if (extensionAuditResult.error) logOptionalQueryError(req, taskId, "task_workday_extension_audit", extensionAuditResult.error);

    const workingDateAudits = (workingDateAuditResult.error ? [] : workingDateAuditResult.data ?? []) as WorkingDateAuditRow[];
    const extensionAudits = (extensionAuditResult.error ? [] : extensionAuditResult.data ?? []) as ExtensionAuditRow[];
    const actorIds = [...new Set([...workingDateAudits, ...extensionAudits].flatMap((row) => row.actor_id ? [row.actor_id] : []))];
    const actorNames = new Map<string, string>();
    if (actorIds.length) {
      const actorResult = await adminClient.from("users").select("id, name, email").in("id", actorIds);
      if (actorResult.error) {
        logOptionalQueryError(req, taskId, "schedule audit actors", actorResult.error);
      } else {
        (actorResult.data ?? []).forEach((actor) => actorNames.set(actor.id, actor.name?.trim() || actor.email?.trim() || "Unknown user"));
      }
    }

    const historyByDate = new Map<string, Array<{
      id: string;
      changeType: "WORKING_DATE_ADDED" | "WORKING_DATE_REMOVED" | "WORK_HOURS_EXTENDED" | "WORK_HOURS_CHANGED" | "WORK_HOURS_CANCELLED";
      workDate: string;
      oldValue: string | null;
      newValue: string | null;
      actorId: string | null;
      actorName: string;
      reason: string | null;
      changedAt: string;
    }>>();
    const addHistory = (workDate: string, entry: (typeof historyByDate extends Map<string, Array<infer T>> ? T : never)) => {
      historyByDate.set(workDate, [...(historyByDate.get(workDate) ?? []), entry]);
    };
    workingDateAudits.forEach((row) => addHistory(row.work_date, {
      id: row.id,
      changeType: row.action === "added" ? "WORKING_DATE_ADDED" : "WORKING_DATE_REMOVED",
      workDate: row.work_date,
      oldValue: row.action === "added" ? "Off day" : "Working day",
      newValue: row.action === "added" ? "Working day" : "Off day",
      actorId: row.actor_id,
      actorName: row.actor_id ? actorNames.get(row.actor_id) ?? "Unknown user" : "Unknown user",
      reason: row.reason,
      changedAt: row.created_at,
    }));
    extensionAudits.forEach((row) => addHistory(row.work_date, {
      id: row.id,
      changeType: row.action === "created" ? "WORK_HOURS_EXTENDED" : row.action === "updated" ? "WORK_HOURS_CHANGED" : "WORK_HOURS_CANCELLED",
      workDate: row.work_date,
      oldValue: row.old_extended_until_local_time,
      newValue: row.new_extended_until_local_time,
      actorId: row.actor_id,
      actorName: row.actor_id ? actorNames.get(row.actor_id) ?? "Unknown user" : "Unknown user",
      reason: row.reason,
      changedAt: row.created_at,
    }));
    historyByDate.forEach((history) => history.sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt)));

    const extensionByDate = new Map(extensions.map((extension) => [extension.workDate, extension]));
    const dateDetails: Record<string, {
      assignees: { userId: string | null; name: string; source: "recorded" | "current" }[];
      extension: (typeof extensions)[number] | null;
      history: (typeof historyByDate extends Map<string, infer T> ? T : never);
    }> = {};

    historyByDate.forEach((history, workDate) => {
      dateDetails[workDate] = { assignees: [], extension: extensionByDate.get(workDate) ?? null, history };
    });

    try {
      if (
        !extensionError
        && dates.length > 0
        && schedule.timeZone
        && schedule.normalWorkdayStart
        && schedule.normalWorkdayEnd
        && schedule.todayLocalDate
      ) {
        const orderedDates = [...dates].sort(compareDateOnly);
        const rangeStart = projectLocalDateTimeToUtc(
          orderedDates[0],
          schedule.normalWorkdayStart,
          schedule.timeZone,
        );
        const lastDate = orderedDates[orderedDates.length - 1];
        const lastExtension = extensionByDate.get(lastDate);
        const rangeEnd = lastExtension?.extendedUntilLocalTime === "24:00:00"
          ? projectLocalDateTimeToUtc(addDaysToDateOnly(lastDate, 1), "00:00", schedule.timeZone)
          : projectLocalDateTimeToUtc(
              lastDate,
              lastExtension?.extendedUntilLocalTime ?? schedule.normalWorkdayEnd,
              schedule.timeZone,
            );

        const [sessionResult, taskResult] = await Promise.all([
          adminClient
            .from("task_assignee_work_sessions")
            .select("assignee_id, assignee_name_snapshot, started_at, ended_at")
            .eq("task_id", taskId)
            .lt("started_at", rangeEnd.toISOString())
            .or(`ended_at.is.null,ended_at.gt.${rangeStart.toISOString()}`)
            .order("started_at", { ascending: true })
            .limit(5000),
          adminClient
            .from("tasks")
            .select("assigned_user:users(id, name, email), task_assignees(user_id, user:users(id, name, email))")
            .eq("id", taskId)
            .single(),
        ]);
        if (sessionResult.error) {
          logOptionalQueryError(req, taskId, "task_assignee_work_sessions", sessionResult.error);
        }
        if (taskResult.error) {
          logOptionalQueryError(req, taskId, "task assignees", taskResult.error);
        }

        type Person = { id: string; name: string | null; email: string | null };
        const task = taskResult.data as unknown as {
          assigned_user: Person | Person[] | null;
          task_assignees: {
            user_id: string;
            user: Person | Person[] | null;
          }[] | null;
        } | null;
        const currentAssignees = new Map<string, { userId: string; name: string; source: "current" }>();
        const addCurrent = (relation: Person | Person[] | null) => {
          const person = Array.isArray(relation) ? relation[0] ?? null : relation;
          if (!person) return;
          currentAssignees.set(person.id, {
            userId: person.id,
            name: person.name?.trim() || person.email?.trim() || "Unknown user",
            source: "current",
          });
        };
        if (task && !taskResult.error) {
          addCurrent(task.assigned_user);
          (task.task_assignees ?? []).forEach((assignee) => addCurrent(assignee.user));
        }

        const now = Date.now();
        if (!sessionResult.error && !taskResult.error) {
          orderedDates.forEach((workDate) => {
            const extension = extensionByDate.get(workDate) ?? null;
            const windowStart = projectLocalDateTimeToUtc(
              workDate,
              schedule.normalWorkdayStart!,
              schedule.timeZone!,
            ).getTime();
            const windowEnd = extension?.extendedUntilLocalTime === "24:00:00"
              ? projectLocalDateTimeToUtc(addDaysToDateOnly(workDate, 1), "00:00", schedule.timeZone!).getTime()
              : projectLocalDateTimeToUtc(
                  workDate,
                  extension?.extendedUntilLocalTime ?? schedule.normalWorkdayEnd!,
                  schedule.timeZone!,
                ).getTime();
            const recorded = new Map<string, { userId: string | null; name: string; source: "recorded" }>();

            (sessionResult.data ?? []).forEach((session) => {
              const startedAt = new Date(session.started_at).getTime();
              const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : now;
              if (startedAt >= windowEnd || endedAt <= windowStart) return;
              const name = session.assignee_name_snapshot?.trim() || "Unknown user";
              const key = session.assignee_id ? `id:${session.assignee_id}` : `name:${name.toLowerCase()}`;
              recorded.set(key, {
                userId: session.assignee_id,
                name,
                source: "recorded",
              });
            });

            const useCurrent = compareDateOnly(workDate, schedule.todayLocalDate!) >= 0 && recorded.size === 0;
            dateDetails[workDate] = {
              assignees: useCurrent ? [...currentAssignees.values()] : [...recorded.values()],
              extension,
              history: historyByDate.get(workDate) ?? [],
            };
          });
        }
      }
    } catch (error) {
      Object.keys(dateDetails).forEach((workDate) => delete dateDetails[workDate]);
      historyByDate.forEach((history, workDate) => {
        dateDetails[workDate] = { assignees: [], extension: extensionByDate.get(workDate) ?? null, history };
      });
      logOptionalQueryError(req, taskId, "working-date tooltip details", error);
    }

    return jsonNoStore({
      ...schedule,
      currentExtension: extensionError
        ? schedule.currentExtension ?? null
        : extensions.find((extension) => extension.workDate === schedule.todayLocalDate) ?? null,
      extensions,
      dateDetails,
    });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to load task working dates." }, 500);
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const body = (await req.json()) as UpdateWorkingDatesRequest;
    const workingDates = body.workingDates ?? body.dates;
    if (
      !Array.isArray(workingDates)
      || workingDates.length === 0
      || workingDates.length > 366
      || workingDates.some((date) => !isDateOnly(date))
    ) {
      return jsonNoStore({ error: "dates must contain 1 to 366 valid YYYY-MM-DD values." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to update task working dates." }, 401);

    const { data, error } = await adminClient.rpc("replace_task_working_dates_and_boundaries", {
      p_task_id: taskId,
      p_dates: [...new Set(workingDates)],
      p_actor_id: user.id,
      p_reason: typeof body.reason === "string" ? body.reason : null,
    });
    if (isHistoricalReasonError(error)) return jsonNoStore(historicalReasonRequiredResponse(), 409);
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to update task working dates." }, 500);
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const body = (await req.json()) as UpdateWorkingDatesRequest;
    const workingDates = body.workingDates ?? body.dates;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);
    if (!title) return jsonNoStore({ error: "Task title is required." }, 400);
    if (
      !Array.isArray(workingDates)
      || workingDates.length === 0
      || workingDates.length > 366
      || workingDates.some((date) => !isDateOnly(date))
    ) {
      return jsonNoStore({ error: "dates must contain 1 to 366 valid YYYY-MM-DD values." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to update this task." }, 401);

    const { data, error } = await adminClient.rpc("update_task_with_schedule", {
      p_task_id: taskId,
      p_title: title,
      p_description: typeof body.description === "string" ? body.description : null,
      p_dates: [...new Set(workingDates)],
      p_actor_id: user.id,
      p_reason: typeof body.reason === "string" ? body.reason : null,
    });
    if (isHistoricalReasonError(error)) return jsonNoStore(historicalReasonRequiredResponse(), 409);
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to update task." }, 500);
  }
}
