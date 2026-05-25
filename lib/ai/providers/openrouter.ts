import type { AiProvider, AiMessage, AiRequestConfig, AiProviderResponse } from "../types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export const openrouterProvider: AiProvider = {
  name: "openrouter",

  async generate(
    messages: AiMessage[],
    config: AiRequestConfig,
  ): Promise<AiProviderResponse> {
    if (!OPENROUTER_API_KEY) {
      throw Object.assign(
        new Error("OPENROUTER_API_KEY not configured"),
        { status: 500, retryable: false },
      );
    }

    const model = config.model ?? DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
          "X-Title": "Team Task Manager",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature ?? 0.3,
          max_tokens: config.max_tokens ?? 350,
          ...(config.response_format ? { response_format: config.response_format } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw Object.assign(
          new Error("OpenRouter request timed out"),
          { status: 408, retryable: true },
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[AI:openrouter] Error ${response.status}:`, errorText);

      const retryable = [402, 429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`OpenRouter ${response.status}: ${errorText.slice(0, 200)}`),
        { status: response.status, retryable },
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    return {
      content,
      provider: "openrouter",
      model,
    };
  },
};
