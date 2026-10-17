/**
 * Єдиний модуль виклику моделей штучного інтелекту (п. 1.5).
 *
 * Вимоги:
 * 1. Один провайдер — Claude API (Anthropic).
 * 2. Модель налаштовується через серверний env: ANTHROPIC_MODEL (за замовчуванням claude-sonnet-4-20250514).
 * 3. Ключі лише в серверних env (ANTHROPIC_API_KEY).
 * 4. Обов'язкова позначка у кожній відповіді:
 *    «Згенеровано ШІ. Не є медичним висновком, перевіряє лікар.»
 */

export * from "./anonymizer";

export const AI_DISCLAIMER =
  "Згенеровано ШІ. Не є медичним висновком, перевіряє лікар.";

export const DEFAULT_AI_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

export type AICallOptions = {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

export type AICallResult = {
  text: string;
  model: string;
  disclaimer: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

/**
 * Єдина точка виклику зовнішньої моделі ШІ у системі.
 * Використовує Claude API з серверними ключами безпеки.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "API ключ ANTHROPIC_API_KEY не налаштований у змінних середовища сервера (.env.local)."
    );
  }

  const model = options.model || DEFAULT_AI_MODEL;
  const maxTokens = options.maxTokens || 4000;
  const temperature = options.temperature ?? 0.3;

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: options.prompt }],
  };

  if (options.system) {
    requestBody.system = options.system;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[callAI] Anthropic API error:", response.status, errorText);
    let message = `Помилка Claude API (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {}
    throw new Error(message);
  }

  const data = await response.json();
  const rawText =
    data.content
      ?.filter((block: any) => block.type === "text")
      ?.map((block: any) => block.text)
      ?.join("\n") || "";

  return {
    text: rawText,
    model,
    disclaimer: AI_DISCLAIMER,
    usage: {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  };
}
