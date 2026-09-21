import fs from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { config } from "../config";
import { getModelProvider } from "../modelProvider";
import { extractPptx } from "../fileProcessing/pptx";
import { appendToBrandReference, readBrandReference } from "./store";

const PROCESSED_LOG = () => path.join(config.dataDir, "brand-source-processed.json");

async function getProcessedFiles(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(PROCESSED_LOG(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveProcessedFiles(map: Record<string, string>): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(PROCESSED_LOG(), JSON.stringify(map, null, 2), "utf-8");
}

async function extractRawText(filePath: string): Promise<string | null> {
  const ext = filePath.toLowerCase().split(".").pop();
  const buffer = await fs.readFile(filePath);
  if (ext === "pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }
  if (ext === "pptx") {
    const extracted = await extractPptx(buffer);
    return extracted.blocks.map((b) => b.text).join("\n");
  }
  return null; // unsupported source type, skipped rather than failing the whole build
}

/**
 * Scans brand-source/ for files not yet folded into the brand reference
 * (tracked by mtime in data/brand-source-processed.json), summarizes each
 * with the model, and appends the result. Safe to call repeatedly — only
 * new or modified files are processed, satisfying "updates as the folder
 * grows" from the PRD without ever overwriting the reference.
 *
 * NOTE: the PRD describes source material syncing from OneDrive/NAS. That
 * sync is out of scope for this build — this function only reads whatever
 * is already present in BRAND_SOURCE_DIR. Wiring an OneDrive/NAS mirror job
 * to drop files into that folder is the extension point.
 */
export async function buildOrUpdateBrandReference(): Promise<{ processed: string[]; skipped: string[] }> {
  await fs.mkdir(config.brandSourceDir, { recursive: true });
  const entries = await fs.readdir(config.brandSourceDir);
  const processedLog = await getProcessedFiles();
  const provider = getModelProvider();

  const processed: string[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(config.brandSourceDir, entry);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;

    const fingerprint = `${stat.size}-${stat.mtimeMs}`;
    if (processedLog[entry] === fingerprint) {
      skipped.push(entry);
      continue;
    }

    const rawText = await extractRawText(fullPath);
    if (!rawText || !rawText.trim()) {
      skipped.push(entry);
      continue;
    }

    const currentReference = await readBrandReference();
    const section = await provider.summarizeBrandSource(entry, rawText);
    await appendToBrandReference(section, `brand-source/${entry}`);
    void currentReference; // reference re-read per file to keep prompts current if this is parallelized later

    processedLog[entry] = fingerprint;
    processed.push(entry);
  }

  await saveProcessedFiles(processedLog);
  return { processed, skipped };
}
