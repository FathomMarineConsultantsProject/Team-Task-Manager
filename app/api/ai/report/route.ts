import { NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai/fallback";
import { REPORT_PROVIDERS, REPORT_CONFIG } from "@/lib/ai/models";
import type { AiMessage } from "@/lib/ai/types";

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
    const body = await req.json();
    const { prompt } = body as { prompt: string };

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Report prompt is required" },
        { status: 400 },
      );
    }

    const messages: AiMessage[] = [
      {
        role: "system",
        content:
          "You are a professional project management analyst. Generate clear, well-structured executive reports. Use clean HTML formatting with <h2>, <strong>, <p>, <ul>, <li> tags. Use colored spans for status indicators: green (#10b981) for positive, amber (#f59e0b) for warnings, red (#ef4444) for critical issues. Be concise, data-driven, and actionable.",
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
