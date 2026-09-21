import mammoth from "mammoth";
import * as cheerio from "cheerio";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { BrandingPlan, ContentBlock, ExtractedDocument } from "../modelProvider/types";
import { applyRewrites } from "./applyCommon";
import { brandStyle } from "../brandReference/brandStyle";

/**
 * Extracts blocks in document order, including tables and inline images —
 * both were previously silently dropped (only h1-6/p/li text survived),
 * which meant any source deck/doc with a data table or photo lost that
 * content entirely on the way to the branded output. mammoth embeds images
 * as base64 data URIs by default, which is what lets us carry them through.
 */
export async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const result = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(result.value);

  const blocks: ContentBlock[] = [];
  let i = 0;
  const nextId = () => `b${i++}`;

  $("body")
    .children()
    .each((_, el) => {
      const node = $(el);
      const tag = el.tagName?.toLowerCase();

      if (tag && /^h[1-6]$/.test(tag)) {
        const text = node.text().trim();
        if (text) blocks.push({ id: nextId(), kind: "heading", level: Number(tag[1]), text });
        return;
      }

      if (tag === "p") {
        const text = node.text().trim();
        if (text) blocks.push({ id: nextId(), kind: "paragraph", text });
        const img = node.find("img").first();
        if (img.length) pushImageBlock(blocks, nextId(), img.attr("src"));
        return;
      }

      if (tag === "ul" || tag === "ol") {
        node.find("li").each((_, li) => {
          const text = $(li).text().trim();
          if (text) blocks.push({ id: nextId(), kind: "bullet_list", text });
        });
        return;
      }

      if (tag === "table") {
        const rows: string[][] = [];
        node.find("tr").each((_, tr) => {
          const cells: string[] = [];
          $(tr)
            .find("td, th")
            .each((_, cell) => {
              cells.push($(cell).text().trim());
            });
          if (cells.length) rows.push(cells);
        });
        if (rows.length) blocks.push({ id: nextId(), kind: "table", text: "", tableRows: rows });
        return;
      }

      if (tag === "img") {
        pushImageBlock(blocks, nextId(), node.attr("src"));
        return;
      }
    });

  return { sourceFormat: "docx", blocks };
}

function pushImageBlock(blocks: ContentBlock[], id: string, src: string | undefined) {
  if (!src) return;
  const match = src.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return; // non-data-URI image sources (external links) are not supported in this build
  const [, mimeType, base64] = match;
  blocks.push({ id, kind: "image", text: "", image: { mimeType, base64 } });
}

/**
 * Renders brand styling directly onto the generated DOCX: accent-orange
 * title, bold headings with an orange underline rule, Open Sans throughout,
 * branded tables, carried-through images, and the standard "PRIVATE &
 * CONFIDENTIAL | PRAVAIG <year>" footer — all pulled from
 * brandReference/brandStyle.ts so a correction that changes the
 * palette/typeface updates both DOCX and PPTX output consistently.
 */
export async function generateDocx(doc: ExtractedDocument, plan: BrandingPlan): Promise<Buffer> {
  const finalBlocks = applyRewrites(doc.blocks, plan);
  const children: (Paragraph | Table)[] = [];

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
    // Table/image payloads are checked ahead of `kind` so a model
    // change_kind instruction can't accidentally make a table or image
    // silently vanish (its text field is empty, so it would otherwise fall
    // through to nothing being rendered at all).
    if (b.tableRows?.length) {
      children.push(tableFromRows(b.tableRows));
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    } else if (b.image) {
      const imagePara = imageParagraph(b.image);
      if (imagePara) children.push(imagePara);
    } else if (b.kind === "heading") {
      children.push(headingParagraph(b));
    } else if (b.kind === "bullet_list") {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [bodyRun(b.text)],
        }),
      );
    } else if (b.text) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [bodyRun(b.text)],
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

function bodyRun(text: string): TextRun {
  return new TextRun({ text, color: brandStyle.colors.dark, font: brandStyle.fonts.primary, size: 22 });
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

function tableFromRows(rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map(
            (cellText) =>
              new TableCell({
                shading:
                  rowIndex === 0
                    ? { type: ShadingType.CLEAR, color: "auto", fill: brandStyle.colors.accent }
                    : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText,
                        font: brandStyle.fonts.primary,
                        size: 20,
                        bold: rowIndex === 0,
                        color: rowIndex === 0 ? brandStyle.colors.white : brandStyle.colors.dark,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

/** Max 500px display width, matching mammoth's typical embedded image scale;
 *  precise source dimensions aren't read here since docx.ImageRun needs an
 *  explicit size — a documented simplification, not lossy for photos/logos
 *  at typical document widths. */
function imageParagraph(image: { mimeType: string; base64: string }): Paragraph | null {
  const type = image.mimeType.split("/")[1];
  if (!type || !["png", "jpeg", "jpg", "gif", "bmp"].includes(type)) return null;
  const normalizedType = type === "jpeg" ? "jpg" : type;

  return new Paragraph({
    spacing: { after: 160 },
    children: [
      new ImageRun({
        type: normalizedType as "png" | "jpg" | "gif" | "bmp",
        data: Buffer.from(image.base64, "base64"),
        transformation: { width: 400, height: 260 },
      }),
    ],
  });
}
