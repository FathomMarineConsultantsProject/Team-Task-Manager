import type { AiProvider, AiMessage, AiRequestConfig, AiProviderResponse } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const DEFAULT_MODEL = "gemini-2.0-flash";

const GEMINI_COOLDOWN_MS = 5 * 60 * 1000;
const GEMINI_429_WINDOW_MS = 2 * 60 * 1000;
const GEMINI_429_THRESHOLD = 2;

let geminiCooldownUntil = 0;
let geminiRecent429Count = 0;
let geminiLast429At = 0;

/**
 * Convert OpenAI-style messages to Gemini's format.
 * Gemini uses { role: "user"|"model", parts: [{ text }] } and a
 * separate `systemInstruction` field for the system prompt.
 */
function toGeminiPayload(messages: AiMessage[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return {
    systemInstruction: systemParts.length > 0
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined,
    contents,
  };
}

export const geminiProvider: AiProvider = {
  name: "gemini",

  async generate(
    messages: AiMessage[],
    config: AiRequestConfig,
  ): Promise<AiProviderResponse> {
    if (!GEMINI_API_KEY) {
      throw Object.assign(
        new Error("GEMINI_API_KEY not configured — skipping Gemini"),
        { status: 500, retryable: false },
      );
    }

    const now = Date.now();
    if (geminiCooldownUntil > now) {
      throw Object.assign(
        new Error("Gemini is cooling down after repeated rate limits"),
        { status: 429, retryable: false },
      );
    }

    const model = config.model ?? DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const { systemInstruction, contents } = toGeminiPayload(messages);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(systemInstruction ? { systemInstruction } : {}),
          contents,
          generationConfig: {
            temperature: config.temperature ?? 0.4,
            maxOutputTokens: config.max_tokens ?? 2048,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw Object.assign(
          new Error("Gemini request timed out"),
          { status: 408, retryable: true },
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[AI:gemini] Error ${response.status}:`, errorText);

      if (response.status === 429) {
        if (now - geminiLast429At > GEMINI_429_WINDOW_MS) {
          geminiRecent429Count = 0;
        }
        geminiRecent429Count += 1;
        geminiLast429At = now;
        if (geminiRecent429Count >= GEMINI_429_THRESHOLD) {
          geminiCooldownUntil = now + GEMINI_COOLDOWN_MS;
        }
      }

      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      throw Object.assign(
        new Error(`Gemini ${response.status}: ${errorText.slice(0, 200)}`),
        { status: response.status, retryable },
      );
    }

    const data = await response.json();
    const content =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    geminiRecent429Count = 0;
    geminiLast429At = 0;
    geminiCooldownUntil = 0;

    return {
      content,
      provider: "gemini",
      model,
    };
  },
};
