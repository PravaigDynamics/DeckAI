import { config } from "../config";
import { GeminiProvider } from "./geminiProvider";
import type { ModelProvider } from "./types";

/**
 * Factory: picks the model provider implementation based on MODEL_PROVIDER
 * config alone. To add a new provider (OpenAI, a local model, etc.):
 *   1. Add a new file in this folder implementing ModelProvider.
 *   2. Add a case below.
 *   3. Set MODEL_PROVIDER in .env — no other code changes needed.
 */
let cached: ModelProvider | null = null;

export function getModelProvider(): ModelProvider {
  if (cached) return cached;

  switch (config.modelProvider) {
    case "gemini":
      cached = new GeminiProvider(config.gemini.apiKey, config.gemini.model);
      return cached;
    default:
      throw new Error(
        `Unknown MODEL_PROVIDER "${config.modelProvider}". Supported: gemini.`,
      );
  }
}

export type { ModelProvider, BrandingPlan, ExtractedDocument, ContentBlock, BrandingInstruction } from "./types";
