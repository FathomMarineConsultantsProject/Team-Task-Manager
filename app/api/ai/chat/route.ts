import { NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai/fallback";
import { CHAT_PROVIDERS, CHAT_CONFIG } from "@/lib/ai/models";
import type { AiMessage } from "@/lib/ai/types";

type StructuredAiResponse = {
  action: string;
  message: string;
  data?: Record<string, unknown>;
  questions?: string[];
  partial_data?: Record<string, unknown>;
};

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fencedParsed = tryParseJson(fenced[1].trim());
    if (fencedParsed) return fencedParsed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    const slicedParsed = tryParseJson(sliced);
    if (slicedParsed) return slicedParsed;
  }

  return null;
}

function stripJsonCodeBlocks(text: string): string {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();
}

function fallbackMessageForAction(action: string): string {
  switch (action) {
    case "create_task":
      return "I can create that task. Review the details and confirm.";
    case "add_comment":
      return "I can add that comment. Review the details and confirm.";
    case "update_description":
      return "I can update the task description. Review the details and confirm.";
    case "clarify":
      return "I need a few more details before I can proceed.";
    default:
      return "I can help with that.";
  }
}

function normalizeStructuredResponse(raw: unknown): StructuredAiResponse {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const action = typeof obj.action === "string" ? obj.action : "message";

    if (typeof obj.message === "string") {
      const inner = extractJsonFromText(obj.message);
      if (inner && typeof inner === "object") {
        return normalizeStructuredResponse(inner);
      }
    }

    const message = typeof obj.message === "string" && obj.message.trim()
      ? obj.message
      : fallbackMessageForAction(action);

    return {
      action,
      message,
      data: obj.data as Record<string, unknown> | undefined,
      questions: obj.questions as string[] | undefined,
      partial_data: obj.partial_data as Record<string, unknown> | undefined,
    };
  }

  if (typeof raw === "string") {
    const parsed = extractJsonFromText(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeStructuredResponse(parsed);
    }

    const cleaned = stripJsonCodeBlocks(raw);
    return {
      action: "message",
      message: cleaned || fallbackMessageForAction("message"),
    };
  }

  return { action: "message", message: fallbackMessageForAction("message") };
}

function buildSystemPrompt(): string {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDay = dayNames[today.getDay()];

  return `You are an AI assistant for a Team Task Manager application. You help users create tasks, add comments, and manage their projects.

TODAY'S DATE: ${todayStr} (${todayDay})

IMPORTANT DATE PARSING RULES:
- "tomorrow" = ${new Date(today.getTime() + 86400000).toISOString().split("T")[0]}
- "day after tomorrow" = ${new Date(today.getTime() + 172800000).toISOString().split("T")[0]}
- "next Monday/Tuesday/etc" = calculate the NEXT occurrence of that day from today
- "in X days" = today + X days
- "next week" = next Monday
- "end of week" = this coming Friday
- "end of month" = last day of current month
- Always convert relative dates to YYYY-MM-DD format in your response
- If a user says "due Friday" figure out which Friday they mean (this week or next)

You have access to the context about the user's project including members and existing tasks.
Use task descriptions in summaries, comparisons, and analysis when available.

When a user asks you to create a task, extract these fields:
- title (required): a clear, concise task title
- description: short task description when provided or requested
- status: one of "todo", "in_progress", "in_review", "done" (default: "todo")
- assignee_id: the UUID of the person to assign (match name against project members). Use the ID, not the name.
- assignee_name: the display name of the matched assignee
- start_date: YYYY-MM-DD format or null
- end_date: YYYY-MM-DD format or null

When a user asks you to update a task description, extract:
- task_id: the ID of the matched task
- task_name: which task to update (if task_id is missing, try to match by name)
- description: the new description text

When a user asks to add a comment/update, extract:
- task_name: which task to comment on (fuzzy match against existing tasks)
- task_id: the ID of the matched task
- content: the comment text

RESPOND WITH VALID JSON ONLY. Use one of these formats:

1. Task creation (when you have enough info):
{"action": "create_task", "data": {"title": "...", "description": "...", "status": "todo", "assignee_id": "uuid-or-null", "assignee_name": "Name or null", "start_date": "YYYY-MM-DD or null", "end_date": "YYYY-MM-DD or null"}, "message": "I'll create this task for you."}

2. Comment addition:
{"action": "add_comment", "data": {"task_name": "...", "task_id": "uuid-or-null", "content": "..."}, "message": "I'll add this comment."}

3. Description update:
{"action": "update_description", "data": {"task_id": "uuid-or-null", "task_name": "...", "description": "..."}, "message": "I'll update the task description."}

4. If you need more information (PROACTIVELY ask about missing details):
{"action": "clarify", "questions": ["What should the deadline be?", "Who should this be assigned to?"], "message": "I need a few more details before creating this task.", "partial_data": {"title": "...", "status": "todo"}}

5. General help or conversation:
{"action": "message", "message": "Here's how you can..."}

BEHAVIOR RULES:
- If the user mentions a task title but no assignee or dates, ASK who to assign it to and what the deadline should be before creating
- If you can match an assignee name to a project member, use their ID
- If dates are ambiguous, ask for clarification
- Be proactive about filling in missing details
- When creating tasks, show what column/status it will be in
- Keep responses concise and helpful`;
}

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message,
      context,
      history = [],
    } = body as {
      message: string;
      context?: {
        projectName?: string;
        projectId?: string;
        members?: { name: string; id: string }[];
        tasks?: { title: string; status: string; id: string; description?: string | null; end_date?: string | null }[];
      };
      history?: Message[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Build context string — limit data to avoid token waste
    let contextStr = "";
    if (context) {
      contextStr += `\n\nCURRENT PROJECT: "${context.projectName ?? "Unknown"}" (ID: ${context.projectId ?? "none"})\n`;
      if (context.members?.length) {
        const limitedMembers = context.members.slice(0, 15);
        contextStr += `\nPROJECT MEMBERS (use these IDs for assignee_id):\n${limitedMembers.map(m => `- ${m.name} (id: ${m.id})`).join("\n")}\n`;
      }
      if (context.tasks?.length) {
        const limitedTasks = context.tasks.slice(0, 20);
        contextStr += `\nEXISTING TASKS (use these IDs for task_id):\n${limitedTasks.map(t => {
          const desc = t.description ? ` — ${t.description}` : "";
          const due = t.end_date ? ` (due ${t.end_date})` : "";
          return `- "${t.title}" [${t.status}]${due} (id: ${t.id})${desc}`;
        }).join("\n")}\n`;
        if (context.tasks.length > 20) {
          contextStr += `(... and ${context.tasks.length - 20} more tasks)\n`;
        }
      }
    } else {
      contextStr += "\n\nNO PROJECT CONTEXT AVAILABLE. Ask the user to navigate to a project first, or help with general questions.\n";
    }

    // Build messages — limit history to last 6 for token efficiency
    const messages: AiMessage[] = [
      { role: "system", content: buildSystemPrompt() + contextStr },
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    const result = await generateWithFallback(
      CHAT_PROVIDERS,
      messages,
      CHAT_CONFIG,
    );

    const normalized = normalizeStructuredResponse(result.content);
    return NextResponse.json({ result: normalized });
  } catch (err) {
    console.error("AI chat error:", err);
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
