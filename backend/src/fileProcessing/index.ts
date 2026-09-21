import type { BrandingPlan, ExtractedDocument } from "../modelProvider/types";
import { extractDocx, generateDocx } from "./docx";
import { extractPptx, generatePptx } from "./pptx";
import { extractText, generateText } from "./text";

export type SupportedFormat = "docx" | "pptx" | "text";

export function detectFormat(originalName: string, mimetype: string): SupportedFormat {
  const ext = originalName.toLowerCase().split(".").pop();
  if (ext === "docx" || mimetype.includes("wordprocessingml")) return "docx";
  if (ext === "pptx" || mimetype.includes("presentationml")) return "pptx";
  if (ext === "txt" || mimetype.startsWith("text/")) return "text";
  throw new Error(
    `Unsupported file type "${originalName}". Only .docx, .pptx, and .txt are supported.`,
  );
}

export async function extractDocument(
  format: SupportedFormat,
  buffer: Buffer,
): Promise<ExtractedDocument> {
  switch (format) {
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    case "text":
      return extractText(buffer.toString("utf-8"));
  }
}

export async function generateDocument(
  format: SupportedFormat,
  doc: ExtractedDocument,
  plan: BrandingPlan,
): Promise<Buffer> {
  switch (format) {
    case "docx":
      return generateDocx(doc, plan);
    case "pptx":
      return generatePptx(doc, plan);
    case "text":
      return Buffer.from(generateText(doc, plan), "utf-8");
  }
}

export function outputExtension(format: SupportedFormat): string {
  switch (format) {
    case "docx":
      return "docx";
    case "pptx":
      return "pptx";
    case "text":
      return "txt";
  }
}

export function outputMimeType(format: SupportedFormat): string {
  switch (format) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "text":
      return "text/plain";
  }
}
