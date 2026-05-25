import type { AiProvider, AiMessage, AiRequestConfig, AiProviderResponse } from "../types";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export const groqProvider: AiProvider = {
  name: "groq",

  async generate(
    messages: AiMessage[],
    config: AiRequestConfig,
  ): Promise<AiProviderResponse> {
    if (!GROQ_API_KEY) {
      throw Object.assign(
        new Error("GROQ_API_KEY not configured — skipping Groq fallback"),
        { status: 500, retryable: false },
      );
    }

    const model = config.model ?? DEFAULT_MODEL;

    // Groq uses OpenAI-compatible API
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature ?? 0.3,
          max_tokens: config.max_tokens ?? 350,
          ...(config.response_format ? { response_format: config.response_format } : {}),
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw Object.assign(
          new Error("Groq request timed out"),
          { status: 408, retryable: true },
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[AI:groq] Error ${response.status}:`, errorText);

      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`Groq ${response.status}: ${errorText.slice(0, 200)}`),
        { status: response.status, retryable },
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    return {
      content,
      provider: "groq",
      model,
    };
  },
};
