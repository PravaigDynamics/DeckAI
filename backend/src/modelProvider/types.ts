/**
 * Provider-agnostic model boundary.
 *
 * The model's job stops at DECIDING branding changes — wording, tone,
 * structure, hierarchy, and layout intent. It never touches file bytes.
 * The fileProcessing modules are what actually apply a BrandingPlan to a
 * DOCX/PPTX/text file. Keeping that split means the model provider can be
 * swapped (Gemini -> OpenAI -> a local model, etc.) by changing config only,
 * with zero changes to file generation code.
 */

/** A single structural block extracted from the source file, independent of format. */
export interface ContentBlock {
  id: string;
  /** heading | paragraph | bullet_list | slide_title | slide_body | table | image_placeholder */
  kind: string;
  /** Nesting/level hint, e.g. heading level or bullet indent depth. */
  level?: number;
  text: string;
  /** For slide-based formats: which slide this block belongs to. */
  slideIndex?: number;
}

export interface ExtractedDocument {
  sourceFormat: "docx" | "pptx" | "text";
  title?: string;
  blocks: ContentBlock[];
}

/** One instruction the model emits for how a block (or the doc) should change. */
export interface BrandingInstruction {
  targetBlockId: string | "document";
  /** rewrite_text | change_kind | reorder | set_emphasis | layout_intent | split | merge */
  action: string;
  /** New text, when action rewrites content. */
  text?: string;
  /** New structural kind/level, when action reclassifies a block. */
  kind?: string;
  level?: number;
  /** Free-form layout guidance for the file-processing layer to interpret,
   *  e.g. { chartWidthPercent: 60, headingPosition: "top-left" }. */
  layout?: Record<string, unknown>;
  /** Human-readable rationale, surfaced in review UI for transparency. */
  reason?: string;
}

export interface BrandingPlan {
  documentTitle?: string;
  instructions: BrandingInstruction[];
  /** Notes the model wants to surface to the reviewer (not applied to the file). */
  reviewNotes?: string[];
}

export interface ModelProvider {
  readonly name: string;
  /**
   * Given the extracted content and the current living brand reference
   * (Markdown), return a plan of branding changes to apply.
   */
  planBranding(
    doc: ExtractedDocument,
    brandReferenceMarkdown: string,
  ): Promise<BrandingPlan>;

  /**
   * Given a reviewer's plain-language correction and the current reference,
   * return the Markdown fragment to append to the living brand reference.
   */
  draftReferenceUpdate(
    correctionText: string,
    brandReferenceMarkdown: string,
  ): Promise<string>;

  /**
   * Given raw text extracted from a new/updated brand source document,
   * return a Markdown fragment summarizing brand rules found in it, to be
   * appended to the living brand reference.
   */
  summarizeBrandSource(sourceName: string, rawText: string): Promise<string>;
}
