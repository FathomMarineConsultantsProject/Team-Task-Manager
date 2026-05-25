// ── Shared AI provider types ────────────────────────

export type AiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiRequestConfig = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
};

export type AiProviderResponse = {
  content: string;
  provider: string;
  model: string;
};

export type AiProviderError = {
  provider: string;
  status?: number;
  message: string;
  retryable: boolean;
};

/**
 * Unified provider interface.
 * Each provider implements `generate` to call its respective API.
 */
export interface AiProvider {
  name: string;
  generate(
    messages: AiMessage[],
    config: AiRequestConfig,
  ): Promise<AiProviderResponse>;
}
