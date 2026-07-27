import {
  GoogleGenerativeAI,
  GenerationConfig,
  Part,
  Content,
  GenerateContentResult,
} from "@google/generative-ai";

const MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];

function isModelNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("404") ||
    message.toLowerCase().includes("not found") ||
    message.toLowerCase().includes("is not supported")
  );
}

export type GenerateArgs = {
  apiKey: string;
  systemInstruction?: string;
  generationConfig?: GenerationConfig;
  contents: Content[];
  verbose?: boolean;
};

function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : String(err);
  return (
    message.includes("429") ||
    message.toLowerCase().includes("too many requests") ||
    message.toLowerCase().includes("resource exhausted") ||
    message.toLowerCase().includes("quota")
  );
}

function isRetryableError(err: unknown): boolean {
  if (isRateLimitError(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b(500|502|503|504)\b/.test(message) || message.toLowerCase().includes("fetch failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateContentWithFallback(
  args: GenerateArgs,
): Promise<GenerateContentResult> {
  const { apiKey, systemInstruction, generationConfig, contents, verbose } = args;
  const genAI = new GoogleGenerativeAI(apiKey);

  let lastError: unknown = null;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      generationConfig,
    });

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (verbose) {
          console.log(`[gemini] Trying model=${modelName} attempt=${attempt}`);
        }
        const result = await model.generateContent({ contents });
        return result;
      } catch (err) {
        lastError = err;
        const rateLimited = isRateLimitError(err);
        const retryable = isRetryableError(err);

        if (verbose) {
          console.warn(
            `[gemini] model=${modelName} attempt=${attempt} failed (rateLimited=${rateLimited}, retryable=${retryable}):`,
            err instanceof Error ? err.message : err,
          );
        }

        if (rateLimited) {
          break;
        }

        if (isModelNotFoundError(err)) {
          if (verbose) {
            console.warn(`[gemini] model=${modelName} unavailable, moving to next fallback`);
          }
          break;
        }

        if (!retryable || attempt === maxAttempts) {
          throw err;
        }

        const backoff = 500 * Math.pow(3, attempt - 1);
        await delay(backoff);
      }
    }
  }

  throw lastError ?? new Error("All Gemini model fallbacks failed");
}

export type { Part, Content };
