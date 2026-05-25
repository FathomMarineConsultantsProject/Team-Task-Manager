import type { AiProvider, AiMessage, AiRequestConfig, AiProviderResponse } from "./types";

/**
 * Try each provider in order. If a provider fails with a retryable error
 * (402 credits, 429 rate-limit, 5xx, timeout, network), move to the next.
 * If ALL providers fail, throw the last error.
 */
export async function generateWithFallback(
  providers: AiProvider[],
  messages: AiMessage[],
  config: AiRequestConfig,
): Promise<AiProviderResponse> {
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`[AI] Trying provider: ${provider.name}`);
      const result = await provider.generate(messages, config);
      console.log(`[AI] ✓ Success via ${provider.name} (model: ${result.model})`);
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const status = (error as any).status as number | undefined;
      const retryable = (error as any).retryable as boolean | undefined;

      console.warn(
        `[AI] ✗ ${provider.name} failed — status=${status ?? "?"} retryable=${retryable ?? "?"} — ${error.message.slice(0, 150)}`,
      );

      lastError = error;

      // If the error is explicitly non-retryable (e.g. missing API key),
      // skip to the next provider anyway — it may have its own key.
      continue;
    }
  }

  // All providers exhausted
  console.error("[AI] All providers failed.");
  throw lastError ?? new Error("All AI providers failed");
}
