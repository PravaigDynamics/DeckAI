import mammoth from "mammoth";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { BrandingPlan, ContentBlock, ExtractedDocument } from "../modelProvider/types";
import { applyRewrites } from "./applyCommon";
import { brandStyle } from "../brandReference/brandStyle";

export async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  const blocks: ContentBlock[] = [];
  let i = 0;
  const tagRegex = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    const tag = match[1].toLowerCase();
    const text = stripTags(match[2]).trim();
    if (!text) continue;

    let kind = "paragraph";
    let level: number | undefined;
    if (tag.startsWith("h")) {
      kind = "heading";
      level = Number(tag[1]);
    } else if (tag === "li") {
      kind = "bullet_list";
    }
    blocks.push({ id: `b${i++}`, kind, level, text });
  }

  return { sourceFormat: "docx", blocks };
}

/**
 * Renders brand styling directly onto the generated DOCX: accent-orange
 * title, bold headings with an orange underline rule, Open Sans throughout,
 * and the standard "PRIVATE & CONFIDENTIAL | PRAVAIG <year>" footer — all
 * pulled from brandReference/brandStyle.ts so a correction that changes the
 * palette/typeface updates both DOCX and PPTX output consistently.
 */
export async function generateDocx(doc: ExtractedDocument, plan: BrandingPlan): Promise<Buffer> {
  const finalBlocks = applyRewrites(doc.blocks, plan);
  const children: Paragraph[] = [];

  const title = plan.documentTitle ?? doc.title;
  if (title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 24, color: brandStyle.colors.accent, space: 8 },
        },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 56,
            color: brandStyle.colors.accent,
            font: brandStyle.fonts.primary,
          }),
        ],
      }),
    );
  }

  for (const b of finalBlocks) {
    if (b.kind === "heading") {
      children.push(headingParagraph(b));
    } else if (b.kind === "bullet_list") {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: b.text,
              color: brandStyle.colors.dark,
              font: brandStyle.fonts.primary,
              size: 22,
            }),
          ],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: b.text,
              color: brandStyle.colors.dark,
              font: brandStyle.fonts.primary,
              size: 22,
            }),
          ],
        }),
      );
    }
  }

  const document = new Document({
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: brandStyle.footerText(),
                    color: brandStyle.colors.muted,
                    font: brandStyle.fonts.primary,
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  return buffer;
}

function headingParagraph(block: ContentBlock): Paragraph {
  const sizeByLevel: Record<number, number> = { 1: 32, 2: 26, 3: 22 };
  const size = sizeByLevel[block.level ?? 1] ?? 26;

  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: brandStyle.colors.accent, space: 4 },
    },
    children: [
      new TextRun({
        text: block.text,
        bold: true,
        size,
        color: brandStyle.colors.dark,
        font: brandStyle.fonts.primary,
      }),
    ],
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}
