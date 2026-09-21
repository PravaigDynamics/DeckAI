import path from "path";
import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import PptxGenJS from "pptxgenjs";
import type { BrandingPlan, ContentBlock, ExtractedDocument } from "../modelProvider/types";
import { applyRewrites } from "./applyCommon";
import { brandStyle } from "../brandReference/brandStyle";

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
};

/**
 * PPTX read support: extracts slide text, images, and tables as structural
 * blocks by reading each slideN.xml (and its .rels file, for image
 * relationships) directly from the pptx zip. Images/tables were previously
 * invisible to extraction entirely — a slide with a product photo or a
 * specs table lost that content on the way to the branded deck, same class
 * of bug as the DOCX path had. Full shape/position preservation (exact
 * original layout) is still a documented extension point — see
 * generatePptx below.
 */
export async function extractPptx(buffer: Buffer): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const blocks: ContentBlock[] = [];
  let blockId = 0;
  const nextId = () => `b${blockId++}`;

  for (const file of slideFiles) {
    const slideIndex = slideNumber(file);
    const xml = await zip.file(file)!.async("string");
    const parsed = await parseStringPromise(xml);

    const texts = collectSlideTexts(parsed);
    texts.forEach((text, idx) => {
      blocks.push({
        id: nextId(),
        kind: idx === 0 ? "slide_title" : "slide_body",
        text,
        slideIndex,
      });
    });

    const relsPath = `ppt/slides/_rels/${path.basename(file)}.rels`;
    const relTargets = await readRelationships(zip, relsPath);

    const tables = collectSlideTables(parsed);
    for (const rows of tables) {
      if (rows.length) blocks.push({ id: nextId(), kind: "table", text: "", tableRows: rows, slideIndex });
    }

    const imageRelIds = collectSlideImageRelIds(parsed);
    for (const relId of imageRelIds) {
      const target = relTargets.get(relId);
      if (!target) continue;
      const mediaPath = resolveMediaPath(target);
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;
      const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = IMAGE_EXT_TO_MIME[ext];
      if (!mimeType) continue; // unsupported image type (e.g. embedded svg/emf), skipped rather than failing the whole slide
      const base64 = await mediaFile.async("base64");
      blocks.push({ id: nextId(), kind: "image", text: "", image: { mimeType, base64 }, slideIndex });
    }
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

/** Collects <a:tbl> elements as row-major text grids. */
function collectSlideTables(parsedXml: any): string[][][] {
  const tableEls = deepFind(parsedXml, "a:tbl") ?? [];
  return tableEls.map((tbl) => {
    const rowEls = deepFind(tbl, "a:tr") ?? [];
    return rowEls.map((row) => {
      const cellEls = deepFind(row, "a:tc") ?? [];
      return cellEls.map((cell) => {
        const runs = deepFind(cell, "a:t") ?? [];
        return runs.map((r: any) => (typeof r === "string" ? r : r._ ?? "")).join(" ").trim();
      });
    });
  });
}

/** Collects relationship ids (rId strings) referenced by <p:pic><a:blip r:embed="rIdN"/>. */
function collectSlideImageRelIds(parsedXml: any): string[] {
  const pics = deepFind(parsedXml, "p:pic") ?? [];
  const ids: string[] = [];
  for (const pic of pics) {
    const blips = deepFind(pic, "a:blip") ?? [];
    for (const blip of blips) {
      const relId = blip?.$?.["r:embed"];
      if (relId) ids.push(relId);
    }
  }
  return ids;
}

/** Reads a .rels XML part into a Map of relationship id -> target path. */
async function readRelationships(zip: JSZip, relsPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const file = zip.file(relsPath);
  if (!file) return map;
  const xml = await file.async("string");
  const parsed = await parseStringPromise(xml);
  const relationships = parsed?.Relationships?.Relationship ?? [];
  for (const rel of relationships) {
    const id = rel?.$?.Id;
    const target = rel?.$?.Target;
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Relationship targets are relative to ppt/slides/, e.g. "../media/image1.png". */
function resolveMediaPath(target: string): string {
  return path.posix.normalize(path.posix.join("ppt/slides", target));
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
 * blocks using pptxgenjs (one slide per slideIndex group; first text block
 * on a slide becomes the title, rest become body bullets; tables/images are
 * placed below the text). This intentionally does NOT try to preserve the
 * original deck's exact shape positions/theme — that is the natural next
 * extension (map layout_intent instructions from the model, e.g.
 * chartWidthPercent/headingPosition, onto pptxgenjs shape coordinates) and
 * is stubbed via the `layout` field already threaded through
 * BrandingInstruction.
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
    const textBlocks = blocksForSlide.filter((b) => !b.tableRows && !b.image);
    const tableBlocks = blocksForSlide.filter((b) => b.tableRows?.length);
    const imageBlocks = blocksForSlide.filter((b) => b.image);
    const [titleBlock, ...bodyBlocks] = textBlocks;
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

    // Body text takes the top band; tables/images stack below it so neither
    // overlaps. With both present the slide gets tall — acceptable for a
    // text-first rebuild, and a place layout_intent hints would refine next.
    let cursorY = isTitleSlide ? 3.9 : 1.4;

    if (bodyBlocks.length) {
      const bodyHeight = Math.min(2.6, 0.35 * bodyBlocks.length + 0.3);
      slide.addText(
        bodyBlocks.map((b) => ({
          text: b.text,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.5,
          y: cursorY,
          w: 9,
          h: bodyHeight,
          fontSize: 16,
          fontFace: brandStyle.fonts.primary,
          color: bodyTextColor,
        },
      );
      cursorY += bodyHeight + 0.2;
    }

    for (const tableBlock of tableBlocks) {
      const rows = tableBlock.tableRows!;
      const tableHeight = Math.min(2.5, 0.35 * rows.length);
      slide.addTable(
        rows.map((row, rowIndex) =>
          row.map((cellText) => ({
            text: cellText,
            options: {
              fontFace: brandStyle.fonts.primary,
              fontSize: 12,
              bold: rowIndex === 0,
              color: rowIndex === 0 ? brandStyle.colors.white : brandStyle.colors.dark,
              fill: rowIndex === 0 ? { color: brandStyle.colors.accent } : undefined,
            },
          })),
        ),
        { x: 0.5, y: cursorY, w: 9, h: tableHeight, border: { type: "solid", color: brandStyle.colors.muted, pt: 0.5 } },
      );
      cursorY += tableHeight + 0.25;
    }

    for (const imageBlock of imageBlocks) {
      const { mimeType, base64 } = imageBlock.image!;
      const imgHeight = 2.2;
      slide.addImage({
        data: `data:${mimeType};base64,${base64}`,
        x: 0.5,
        y: cursorY,
        w: 3.2,
        h: imgHeight,
      });
      cursorY += imgHeight + 0.25;
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
