import type { AiRequestConfig, AiProvider } from "./types";
import { openrouterProvider } from "./providers/openrouter";
import { groqProvider } from "./providers/groq";
import { geminiProvider } from "./providers/gemini";

// ── Chat configuration ──────────────────────────────
// Used by the AI assistant panel for task/comment creation.
// Gemini first, Groq fallback, OpenRouter last resort.

export const CHAT_PROVIDERS: AiProvider[] = [
  geminiProvider,
  groqProvider,
  openrouterProvider,
];

export const CHAT_CONFIG: AiRequestConfig = {
  max_tokens: 350,
  temperature: 0.3,
  response_format: { type: "json_object" },
};

// ── Report configuration ────────────────────────────
// Used for executive AI reports — prefers Gemini for larger context
// and better structured output. Groq secondary, OpenRouter last.

export const REPORT_PROVIDERS: AiProvider[] = [
  geminiProvider,
  groqProvider,
  openrouterProvider,
];

export const REPORT_CONFIG: AiRequestConfig = {
  max_tokens: 2048,
  temperature: 0.4,
};
