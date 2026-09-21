import type { BrandingPlan, ContentBlock, ExtractedDocument } from "../modelProvider/types";
import { applyRewrites } from "./applyCommon";

export function extractText(raw: string): ExtractedDocument {
  const lines = raw.split(/\r?\n/);
  const blocks: ContentBlock[] = [];
  let i = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isBullet = /^[-*•]\s+/.test(trimmed);
    const looksLikeHeading = trimmed.length < 80 && /^[A-Z0-9][^.]*$/.test(trimmed) && !isBullet;
    blocks.push({
      id: `b${i++}`,
      kind: isBullet ? "bullet_list" : looksLikeHeading ? "heading" : "paragraph",
      text: isBullet ? trimmed.replace(/^[-*•]\s+/, "") : trimmed,
    });
  }
  return { sourceFormat: "text", blocks };
}

export function generateText(doc: ExtractedDocument, plan: BrandingPlan): string {
  const finalBlocks = applyRewrites(doc.blocks, plan);
  const out: string[] = [];
  if (plan.documentTitle) out.push(plan.documentTitle.toUpperCase(), "");
  for (const b of finalBlocks) {
    if (b.kind === "heading") out.push(b.text.toUpperCase());
    else if (b.kind === "bullet_list") out.push(`- ${b.text}`);
    else out.push(b.text);
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}
