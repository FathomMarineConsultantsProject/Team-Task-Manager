"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, Check, Loader2, AlertCircle } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/button";
import { useAppData } from "@/components/providers/AppDataProvider";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: string;
  data?: Record<string, unknown>;
  questions?: string[];
  partialData?: Record<string, unknown>;
  isError?: boolean;
};

type AiContext = {
  projectName?: string;
  projectId?: string;
  members?: { name: string; id: string }[];
  tasks?: { title: string; status: string; id: string; description?: string | null; end_date?: string | null }[];
};

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context?: AiContext;
  onTaskCreated?: () => void;
  onCommentAdded?: () => void;
  onTaskUpdated?: () => void;
}

/**
 * Defensively extract a structured AI result from potentially malformed data.
 * Handles: double-wrapped JSON, raw JSON strings, provider quirks.
 * Guarantees: result always has { action, message } at minimum.
 */
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

function safeParseAiResult(raw: unknown): {
  action: string;
  message: string;
  data?: Record<string, unknown>;
  questions?: string[];
  partial_data?: Record<string, unknown>;
} {
  // Already a well-formed object from the API
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;

    // Check if `message` field is itself a JSON string containing the actual response
    if (typeof obj.message === "string") {
      const msgStr = obj.message.trim();
      const inner = extractJsonFromText(msgStr);
      if (inner && typeof inner === "object") {
        return safeParseAiResult(inner);
      }
    }

    const action = String(obj.action ?? "message");
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

  // Somehow got a raw string
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const parsed = extractJsonFromText(trimmed);
    if (parsed && typeof parsed === "object") {
      return safeParseAiResult(parsed);
    }
    const cleaned = stripJsonCodeBlocks(trimmed);
    return { action: "message", message: cleaned || fallbackMessageForAction("message") };
  }

  return { action: "message", message: fallbackMessageForAction("message") };
}

/**
 * Strip any raw JSON from assistant message content before sending as history.
 * This prevents the AI from echoing JSON structures in future responses.
 */
function sanitizeForHistory(content: string): string {
  const trimmed = content.trim();
  // If the content itself IS a JSON blob, extract just the message
  const parsed = extractJsonFromText(trimmed);
  if (parsed && typeof parsed === "object") {
    const msg = (parsed as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) {
      return msg;
    }
  }
  return stripJsonCodeBlocks(content) || content;
}

export default function AiAssistantPanel({
  isOpen,
  onClose,
  context,
  onTaskCreated,
  onCommentAdded,
  onTaskUpdated,
}: AiAssistantPanelProps) {
  const { supabase, profile } = useAppData();
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your AI task assistant. I can help you:\n\n• **Create tasks** — \"Create a task to fix the login bug, assign to John, due next Friday\"\n• **Add comments** — \"Add a comment on the design review task saying we need mockups\"\n• **Answer questions** — \"What tasks are in progress?\"\n\nWhat would you like to do?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<AiMessage | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: AiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Sanitize history to prevent raw JSON from leaking into future prompts
      const history = messages
        .filter(m => m.id !== "welcome")
        .map(m => ({
          role: m.role,
          content: m.role === "assistant" ? sanitizeForHistory(m.content) : m.content,
        }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          context: context ?? undefined,
          history,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: data.error,
            isError: true,
          },
        ]);
        return;
      }

      // Defensively parse the result — handles raw JSON, double-wrapping, malformed data
      const result = safeParseAiResult(data.result);
      const aiMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: result.message,
        action: result.action,
        data: result.data,
        questions: result.questions,
        partialData: result.partial_data,
      };

      setMessages(prev => [...prev, aiMsg]);

      // If it's a create_task or add_comment, set as pending for confirmation
      if (result.action === "create_task" || result.action === "add_comment" || result.action === "update_description") {
        setPendingAction(aiMsg);
      }
    } catch (err) {
      console.error("AI request failed", err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't reach the AI service. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, context]);

  const executeAction = useCallback(async () => {
    if (!pendingAction?.data || !profile?.id) {
      console.error("Missing pendingAction data or profile");
      return;
    }

    const pid = context?.projectId;
    if (!pid) {
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "No project context available. Please navigate to a project board first.",
          isError: true,
        },
      ]);
      setPendingAction(null);
      return;
    }

    setIsExecuting(true);

    try {
      if (pendingAction.action === "create_task") {
        const d = pendingAction.data;

        // Use assignee_id directly if available, otherwise match by name
        let assigneeId = d.assignee_id as string | null;
        const assigneeName = d.assignee_name as string | null;

        if (!assigneeId && assigneeName && context?.members) {
          const match = context.members.find(
            m => m.name.toLowerCase() === assigneeName.toLowerCase(),
          );
          assigneeId = match?.id ?? null;
        }

        const description = typeof d.description === "string" ? d.description.trim() : null;
        const { error } = await supabase.from("tasks").insert({
          title: d.title,
          description: description || null,
          status: d.status ?? "todo",
          project_id: pid,
          assigned_to: assigneeId ?? null,
          start_date: d.start_date ?? null,
          end_date: d.end_date ?? null,
          created_by: profile.id,
        });

        if (error) {
          console.error("Task creation error:", error);
          throw error;
        }

        const statusLabel = String(d.status ?? "todo").replace(/_/g, " ").toUpperCase();
        setMessages(prev => [
          ...prev,
          {
            id: `success-${Date.now()}`,
            role: "assistant",
            content: `✅ Task "${d.title}" created in **${statusLabel}**!${assigneeName ? ` Assigned to ${assigneeName}.` : ""}${d.end_date ? ` Due: ${d.end_date}.` : ""}${description ? " Description added." : ""}`,
          },
        ]);
        setPendingAction(null);
        onTaskCreated?.();
      } else if (pendingAction.action === "add_comment") {
        const d = pendingAction.data;

        // Use task_id directly if available, otherwise fuzzy match
        let taskId = d.task_id as string | null;
        const taskName = d.task_name as string | null;

        if (!taskId && taskName && context?.tasks) {
          const match = context.tasks.find(
            t => t.title.toLowerCase().includes(taskName.toLowerCase()),
          );
          taskId = match?.id ?? null;
        }

        if (!taskId) {
          setMessages(prev => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `I couldn't find a task matching "${taskName}". Here are the current tasks:\n${(context?.tasks ?? []).map(t => `• ${t.title}`).join("\n")}`,
              isError: true,
            },
          ]);
          setPendingAction(null);
          return;
        }

        const { error } = await supabase.from("task_updates").insert({
          task_id: taskId,
          project_id: pid,
          user_id: profile.id,
          content: d.content as string,
        });

        if (error) {
          console.error("Comment insert error:", error);
          throw error;
        }

        setMessages(prev => [
          ...prev,
          {
            id: `success-${Date.now()}`,
            role: "assistant",
            content: `✅ Comment added to "${taskName ?? "task"}"!`,
          },
        ]);
        setPendingAction(null);
        onCommentAdded?.();
      } else if (pendingAction.action === "update_description") {
        const d = pendingAction.data;
        const description = typeof d.description === "string" ? d.description.trim() : "";
        let taskId = d.task_id as string | null;
        const taskName = d.task_name as string | null;

        if (!taskId && taskName && context?.tasks) {
          const match = context.tasks.find(
            t => t.title.toLowerCase().includes(taskName.toLowerCase()),
          );
          taskId = match?.id ?? null;
        }

        if (!taskId) {
          setMessages(prev => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `I couldn't find a task matching "${taskName ?? "that"}". Please specify the task title or open the task details.`,
              isError: true,
            },
          ]);
          setPendingAction(null);
          return;
        }

        const { error } = await supabase
          .from("tasks")
          .update({ description: description || null, updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .eq("project_id", pid);

        if (error) {
          console.error("Description update error:", error);
          throw error;
        }

        setMessages(prev => [
          ...prev,
          {
            id: `success-${Date.now()}`,
            role: "assistant",
            content: "✅ Task description updated.",
          },
        ]);
        setPendingAction(null);
        onTaskUpdated?.();
      }
    } catch (err) {
      console.error("Action execution failed", err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Failed to execute the action: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
          isError: true,
        },
      ]);
      setPendingAction(null);
    } finally {
      setIsExecuting(false);
    }
  }, [pendingAction, profile?.id, context, supabase, onTaskCreated, onCommentAdded]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    setMessages(prev => [
      ...prev,
      {
        id: `cancel-${Date.now()}`,
        role: "assistant",
        content: "Action cancelled. What else can I help with?",
      },
    ]);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 z-[9998] flex h-screen w-[420px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">AI Assistant</h3>
            <p className="text-[11px] text-slate-400">
              {context?.projectName ? `Project: ${context.projectName}` : "Navigate to a project for full features"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="shrink-0 mt-0.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Bot size={13} />
                </div>
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-slate-900 text-white"
                  : msg.isError
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-slate-100 bg-slate-50 text-slate-700"
              }`}
            >
              <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                __html: msg.content
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br/>")
              }} />

              {/* Task preview card */}
              {msg.action === "create_task" && msg.data && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Task Preview
                  </p>
                  <p className="mt-1 font-semibold">{String(msg.data.title ?? "")}</p>
                  {msg.data.description && (
                    <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">
                      {String(msg.data.description)}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      {String(msg.data.status ?? "todo").replace(/_/g, " ").toUpperCase()}
                    </span>
                    {(msg.data.assignee_name || msg.data.assignee_id) && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                        → {String(msg.data.assignee_name ?? "Assigned")}
                      </span>
                    )}
                    {msg.data.start_date && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-600">
                        Start: {String(msg.data.start_date)}
                      </span>
                    )}
                    {msg.data.end_date && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                        Due: {String(msg.data.end_date)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Comment preview card */}
              {msg.action === "add_comment" && msg.data && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Comment Preview
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    On: {String(msg.data.task_name ?? "")}
                  </p>
                  <p className="mt-1 text-sm">{String(msg.data.content ?? "")}</p>
                </div>
              )}

              {msg.action === "update_description" && msg.data && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Description Update
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Task: {String(msg.data.task_name ?? msg.data.task_id ?? "")}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{String(msg.data.description ?? "")}</p>
                </div>
              )}

              {/* Clarification questions */}
              {msg.action === "clarify" && msg.questions && (
                <div className="mt-3 space-y-1">
                  {msg.questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                      <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                      {q}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="shrink-0 mt-0.5">
                <Avatar
                  userId={profile?.id}
                  name={profile?.name}
                  email={profile?.email}
                  avatarUrl={profile?.avatar_url}
                  size="xs"
                />
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
              <Bot size={13} />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending action confirmation */}
      {pendingAction && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              {pendingAction.action === "create_task"
                ? "Create this task?"
                : pendingAction.action === "add_comment"
                  ? "Add this comment?"
                  : "Update this description?"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={cancelAction}
                disabled={isExecuting}
                className="rounded-lg px-3 py-1.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void executeAction()}
                disabled={isExecuting}
                className="rounded-lg px-3 py-1.5 text-xs"
              >
                {isExecuting ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Check size={12} className="mr-1" />
                )}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={context?.projectId ? "Ask me to create tasks, add comments..." : "Navigate to a project for full AI features"}
            disabled={isLoading || isExecuting}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={isLoading || !input.trim() || isExecuting}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-400">
          AI may make mistakes. Review actions before confirming.
        </p>
      </div>
    </div>
  );
}
