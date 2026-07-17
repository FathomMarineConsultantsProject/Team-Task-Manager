import { NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai/fallback";
import { REPORT_PROVIDERS, REPORT_CONFIG } from "@/lib/ai/models";
import type { AiMessage } from "@/lib/ai/types";

type RecommendationContext = {
  kind: "project_manager_recommendation";
  audience: "internal" | "client";
  project: Record<string, unknown>;
  progress: Record<string, unknown>;
  effort: (Record<string, unknown> & {
    totalProjectManHoursSeconds?: number;
    highEffortTasks?: unknown[];
    longRunningTasks?: unknown[];
    lowProgressHighEffortTasks?: unknown[];
    reviewBottlenecks?: unknown[];
    team?: unknown[];
    workloadImbalance?: unknown;
  }) | null;
};

function isRecommendationContext(value: unknown): value is RecommendationContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<RecommendationContext>;
  return context.kind === "project_manager_recommendation"
    && (context.audience === "internal" || context.audience === "client")
    && Boolean(context.project && typeof context.project === "object")
    && Boolean(context.progress && typeof context.progress === "object")
    && (context.effort === null || Boolean(context.effort && typeof context.effort === "object"));
}

function buildRecommendationPrompt(context: RecommendationContext) {
  const project = { ...context.project };
  const effort = context.effort ? { ...context.effort } : null;
  if (context.audience === "client") {
    delete project.focusUser;
    if (effort) {
      delete effort.team;
      delete effort.workloadImbalance;
    }
  }
  const boundedEffort = effort ? {
    ...effort,
    highEffortTasks: Array.isArray(effort.highEffortTasks) ? effort.highEffortTasks.slice(0, 10) : [],
    longRunningTasks: Array.isArray(effort.longRunningTasks) ? effort.longRunningTasks.slice(0, 10) : [],
    lowProgressHighEffortTasks: Array.isArray(effort.lowProgressHighEffortTasks) ? effort.lowProgressHighEffortTasks.slice(0, 10) : [],
    reviewBottlenecks: Array.isArray(effort.reviewBottlenecks) ? effort.reviewBottlenecks.slice(0, 10) : [],
  } : null;

  return `Generate exactly 5 concise project-manager recommendations as bullet points, with no introduction.
Use only the structured facts below. Do not invent durations, task history, causes, assignee performance, or workload imbalance.
Treat totalProjectManHoursSeconds and all other durations as seconds. Distinguish task active duration from total man-hours. Mention effort only when the supplied data supports the statement.
Do not assume high effort means poor performance; treat it only as a signal requiring context. Avoid naming any employee as underperforming.
Only call out workload imbalance when workloadImbalance is non-null. A review bottleneck may be discussed only when reviewBottlenecks contains tasks.
Recommend workload reallocation only when the supplied workloadImbalance signal supports it. Focus on schedule, workload balance, review flow, and resource allocation.
For client output, never expose team member names, individual effort, performance judgments, or internal workload comparisons.
Structured context:
${JSON.stringify({ audience: context.audience, project, progress: context.progress, effort: boundedEffort })}`;
}

/**
 * POST /api/ai/report
 *
 * Dedicated endpoint for AI executive report generation.
 * Uses Gemini as primary provider (larger context, better summaries)
 * with OpenRouter as fallback.
 *
 * Unlike the chat endpoint, this does NOT force JSON output —
 * reports are returned as free-form HTML/text.
 */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const structuredContext = isRecommendationContext(body) ? body : null;
    const prompt = structuredContext
      ? buildRecommendationPrompt(structuredContext)
      : (body as { prompt?: unknown } | null)?.prompt;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Report prompt is required" },
        { status: 400 },
      );
    }

    const messages: AiMessage[] = [
      {
        role: "system",
        content: structuredContext
          ? "You are a careful project management analyst. Follow the supplied audience boundary and use only explicit structured facts. Never infer missing time, effort, performance, or causal data. Return concise plain-text bullet points."
          : "You are a professional project management analyst. Generate clear, well-structured executive reports. Use clean HTML formatting with <h2>, <strong>, <p>, <ul>, <li> tags. Use colored spans for status indicators: green (#10b981) for positive, amber (#f59e0b) for warnings, red (#ef4444) for critical issues. Be concise, data-driven, and actionable.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const result = await generateWithFallback(
      REPORT_PROVIDERS,
      messages,
      REPORT_CONFIG,
    );

    return NextResponse.json({
      content: result.content,
      provider: result.provider,
    });
  } catch (err) {
    console.error("AI report error:", err);
    return NextResponse.json(
      { error: "AI report generation is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
