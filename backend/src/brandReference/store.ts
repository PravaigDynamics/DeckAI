import fs from "fs/promises";
import path from "path";
import { config } from "../config";

const SEED_HEADER = `# Pravaig Brand Reference

This file is the living brand reference used by Decks Branded AI. It is
built from the documents in \`brand-source/\` and grows over time from
reviewer corrections. It is APPENDED TO, never overwritten — see
\`brandReference/builder.ts\` and \`brandReference/corrections.ts\`.
`;

export async function ensureBrandReferenceExists(): Promise<void> {
  await fs.mkdir(path.dirname(config.brandReferencePath), { recursive: true });
  try {
    await fs.access(config.brandReferencePath);
  } catch {
    await fs.writeFile(config.brandReferencePath, SEED_HEADER, "utf-8");
  }
}

export async function readBrandReference(): Promise<string> {
  await ensureBrandReferenceExists();
  return fs.readFile(config.brandReferencePath, "utf-8");
}

/**
 * Appends a Markdown section to the reference and writes a timestamped
 * version snapshot alongside it (data/brand-reference-versions/) so P1
 * "version with rollback" has real history to roll back to, even though the
 * rollback UI/endpoint itself is not built yet.
 */
export async function appendToBrandReference(section: string, sourceLabel: string): Promise<void> {
  await ensureBrandReferenceExists();
  const current = await fs.readFile(config.brandReferencePath, "utf-8");

  await snapshotVersion(current);

  const stamped = `\n---\n<!-- appended ${new Date().toISOString()} · source: ${sourceLabel} -->\n\n${section.trim()}\n`;
  await fs.writeFile(config.brandReferencePath, current + stamped, "utf-8");
}

async function snapshotVersion(content: string): Promise<void> {
  const versionsDir = path.join(config.dataDir, "brand-reference-versions");
  await fs.mkdir(versionsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(versionsDir, `${stamp}.md`), content, "utf-8");
}

export async function listBrandReferenceVersions(): Promise<string[]> {
  const versionsDir = path.join(config.dataDir, "brand-reference-versions");
  try {
    const files = await fs.readdir(versionsDir);
    return files.sort();
  } catch {
    return [];
  }
}
