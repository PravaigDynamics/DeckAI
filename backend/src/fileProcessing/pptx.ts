import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import PptxGenJS from "pptxgenjs";
import type { BrandingPlan, ContentBlock, ExtractedDocument } from "../modelProvider/types";
import { applyRewrites } from "./applyCommon";
import { brandStyle } from "../brandReference/brandStyle";

/**
 * PPTX read support: extracts slide text as structural blocks (title/body)
 * by reading each slideN.xml directly from the pptx zip. This is a
 * text-first pass — full shape/position preservation is a documented
 * extension point (see generatePptx below).
 */
export async function extractPptx(buffer: Buffer): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const blocks: ContentBlock[] = [];
  let blockId = 0;

  for (const file of slideFiles) {
    const slideIndex = slideNumber(file);
    const xml = await zip.file(file)!.async("string");
    const parsed = await parseStringPromise(xml);

    const texts = collectSlideTexts(parsed);
    texts.forEach((text, idx) => {
      blocks.push({
        id: `b${blockId++}`,
        kind: idx === 0 ? "slide_title" : "slide_body",
        text,
        slideIndex,
      });
    });
  }

  return { sourceFormat: "pptx", blocks };
}

function slideNumber(path: string): number {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

/** Walks the parsed slide XML tree collecting text runs grouped per shape (<p:sp>). */
function collectSlideTexts(parsedXml: any): string[] {
  const texts: string[] = [];
  const shapes = deepFind(parsedXml, "p:sp") ?? [];
  for (const shape of shapes) {
    const runs = deepFind(shape, "a:t") ?? [];
    const shapeText = runs.map((r: any) => (typeof r === "string" ? r : r._ ?? "")).join(" ").trim();
    if (shapeText) texts.push(shapeText);
  }
  return texts;
}

/** Recursively collects all arrays under a given key name, anywhere in the xml2js object tree. */
function deepFind(node: any, key: string): any[] | undefined {
  if (!node || typeof node !== "object") return undefined;
  let found: any[] = [];
  if (node[key]) found = found.concat(node[key]);
  for (const k of Object.keys(node)) {
    if (k === key) continue;
    const child = node[k];
    if (Array.isArray(child)) {
      for (const item of child) {
        const nested = deepFind(item, key);
        if (nested) found = found.concat(nested);
      }
    } else if (typeof child === "object") {
      const nested = deepFind(child, key);
      if (nested) found = found.concat(nested);
    }
  }
  return found.length ? found : undefined;
}

/**
 * PPTX write support: rebuilds a fresh, brand-aligned deck from the final
 * blocks using pptxgenjs (one slide per slideIndex group; first block on a
 * slide becomes the title, rest become body bullets). This intentionally
 * does NOT try to preserve the original deck's exact shape positions/theme —
 * that is the natural next extension (map layout_intent instructions from
 * the model, e.g. chartWidthPercent/headingPosition, onto pptxgenjs shape
 * coordinates) and is stubbed via the `layout` field already threaded
 * through BrandingInstruction.
 */
export async function generatePptx(doc: ExtractedDocument, plan: BrandingPlan): Promise<Buffer> {
  const finalBlocks = applyRewrites(doc.blocks, plan);
  const pptx = new PptxGenJS();

  const bySlide = new Map<number, ContentBlock[]>();
  for (const b of finalBlocks) {
    const idx = b.slideIndex ?? 1;
    if (!bySlide.has(idx)) bySlide.set(idx, []);
    bySlide.get(idx)!.push(b);
  }

  const slideIndexes = [...bySlide.keys()].sort((a, b) => a - b);
  if (slideIndexes.length === 0) slideIndexes.push(1);

  slideIndexes.forEach((idx, position) => {
    const slide = pptx.addSlide();
    const blocksForSlide = bySlide.get(idx) ?? [];
    const [titleBlock, ...bodyBlocks] = blocksForSlide;
    const isTitleSlide = position === 0;

    // Cover slide gets the brand's signature orange field (per the sample
    // profile decks); content slides stay white with dark text and orange
    // accents, matching the two-tone pattern in brand-source/.
    slide.background = { color: isTitleSlide ? brandStyle.colors.accent : brandStyle.colors.white };
    const bodyTextColor = isTitleSlide ? brandStyle.colors.white : brandStyle.colors.dark;

    if (isTitleSlide && plan.documentTitle) {
      slide.addText(plan.documentTitle.toUpperCase(), {
        x: 0.5,
        y: 2.4,
        w: 9,
        h: 1.4,
        fontSize: 40,
        bold: true,
        fontFace: brandStyle.fonts.primary,
        color: brandStyle.colors.white,
      });
    } else if (titleBlock) {
      slide.addText(titleBlock.text, {
        x: 0.5,
        y: 0.35,
        w: 9,
        h: 0.8,
        fontSize: 24,
        bold: true,
        fontFace: brandStyle.fonts.primary,
        color: isTitleSlide ? brandStyle.colors.white : brandStyle.colors.accent,
      });
    }

    if (bodyBlocks.length) {
      slide.addText(
        bodyBlocks.map((b) => ({
          text: b.text,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.5,
          y: isTitleSlide ? 3.9 : 1.4,
          w: 9,
          h: 5,
          fontSize: 16,
          fontFace: brandStyle.fonts.primary,
          color: bodyTextColor,
        },
      );
    }

    slide.addText(brandStyle.footerText(), {
      x: 0.3,
      y: 5.25,
      w: 9.4,
      h: 0.3,
      fontSize: 8,
      align: "right",
      fontFace: brandStyle.fonts.primary,
      color: isTitleSlide ? brandStyle.colors.white : brandStyle.colors.muted,
    });
  });

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}
