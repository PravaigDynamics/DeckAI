import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  BrandingPlan,
  ExtractedDocument,
  ModelProvider,
} from "./types";

/**
 * Google Gemini (via Google AI Studio) implementation of ModelProvider.
 * This is the ONLY file that knows about Gemini's SDK/API shape. Everything
 * else in the app talks to the ModelProvider interface.
 */
export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example).",
      );
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  /** JSON mode is only correct for planBranding, which returns a structured
   *  plan. The other two methods return plain Markdown text — forcing JSON
   *  mode on them made Gemini wrap the Markdown in a {"markdown": "..."}
   *  envelope instead of returning it directly. */
  private model(opts: { json: boolean }) {
    return this.client.getGenerativeModel({
      model: this.modelName,
      ...(opts.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    });
  }

  async planBranding(
    doc: ExtractedDocument,
    brandReferenceMarkdown: string,
  ): Promise<BrandingPlan> {
    const prompt = `You are a brand alignment assistant for Pravaig. You DECIDE branding
changes only — wording, tone, structure, hierarchy, and layout intent. You do
NOT lay out the file; a separate program applies your decisions.

BRAND REFERENCE (living Markdown document, authoritative rules and past corrections):
"""
${brandReferenceMarkdown || "(empty — no brand reference yet, use general professional/brand-neutral judgment)"}
"""

SOURCE DOCUMENT (format: ${doc.sourceFormat}), extracted as structural blocks:
${JSON.stringify(doc.blocks, null, 2)}

Return ONLY a JSON object matching this shape, no prose outside the JSON:
{
  "documentTitle": string | null,
  "instructions": [
    {
      "targetBlockId": string,        // must match a block id above, or "document"
      "action": "rewrite_text" | "change_kind" | "reorder" | "set_emphasis" | "layout_intent" | "split" | "merge",
      "text": string | null,          // new text, for rewrite_text
      "kind": string | null,          // new block kind, for change_kind
      "level": number | null,
      "layout": object | null,        // free-form layout intent, e.g. {"chartWidthPercent":60,"headingPosition":"top-left"}
      "reason": string | null
    }
  ],
  "reviewNotes": [string]
}

Only include instructions for blocks that actually need a change. Keep
rewrites faithful to the original meaning; you are rebranding tone/structure,
not inventing new content.`;

    const result = await this.model({ json: true }).generateContent(prompt);
    const text = result.response.text();
    return safeParsePlan(text);
  }

  async draftReferenceUpdate(
    correctionText: string,
    brandReferenceMarkdown: string,
  ): Promise<string> {
    const prompt = `You maintain a living Markdown brand reference for Pravaig. A brand
reviewer just gave this correction in plain language about a generated
document:

"""
${correctionText}
"""

CURRENT BRAND REFERENCE:
"""
${brandReferenceMarkdown || "(empty)"}
"""

Write a short, generalized Markdown rule (a few lines, using a "## Rule:"
heading) that captures this correction so it will be applied automatically
to future documents of the same kind. Do not repeat the whole reference back.
Return ONLY the new Markdown fragment to append, no other commentary.`;

    const result = await this.model({ json: false }).generateContent(prompt);
    return result.response.text().trim();
  }

  async summarizeBrandSource(sourceName: string, rawText: string): Promise<string> {
    const prompt = `You are building a living Markdown brand reference for Pravaig from its
brand source documents. Read the following raw text extracted from
"${sourceName}" and produce a concise Markdown section (use a "## Source: ${sourceName}"
heading) summarizing brand-relevant rules you can infer: tone of voice,
structural patterns (headings, bullet style, footers), terminology, and any
explicit guidelines. Skip content that isn't brand-relevant (e.g. boilerplate
numbers/specs). Keep it tight — bullet points preferred.

RAW TEXT:
"""
${rawText.slice(0, 20000)}
"""

Return ONLY the Markdown section, no other commentary.`;

    const result = await this.model({ json: false }).generateContent(prompt);
    return result.response.text().trim();
  }
}

function safeParsePlan(text: string): BrandingPlan {
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      documentTitle: parsed.documentTitle ?? undefined,
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions : [],
      reviewNotes: Array.isArray(parsed.reviewNotes) ? parsed.reviewNotes : [],
    };
  } catch (err) {
    throw new Error(
      `Model returned a response that could not be parsed as JSON: ${(err as Error).message}`,
    );
  }
}
