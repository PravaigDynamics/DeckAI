import type { BrandingPlan, ContentBlock } from "../modelProvider/types";

/**
 * Shared logic for applying a BrandingPlan's per-block instructions
 * (rewrite_text / change_kind / set_emphasis) to a block list. Format-
 * specific modules (docx/pptx/text) call this, then handle their own
 * layout_intent/reorder/split/merge specifics and file serialization.
 */
export function applyRewrites(blocks: ContentBlock[], plan: BrandingPlan): ContentBlock[] {
  const byId = new Map(blocks.map((b) => [b.id, { ...b }]));

  for (const instr of plan.instructions) {
    if (instr.targetBlockId === "document") continue;
    const block = byId.get(instr.targetBlockId);
    if (!block) continue;

    switch (instr.action) {
      case "rewrite_text":
        if (typeof instr.text === "string") block.text = instr.text;
        break;
      case "change_kind":
        if (instr.kind) block.kind = instr.kind;
        if (typeof instr.level === "number") block.level = instr.level;
        break;
      default:
        // reorder / split / merge / layout_intent are format-specific or
        // left to the reviewer to further refine; not applied generically.
        break;
    }
  }

  return blocks.map((b) => byId.get(b.id) ?? b);
}

export function documentLevelInstructions(plan: BrandingPlan) {
  return plan.instructions.filter((i) => i.targetBlockId === "document");
}
