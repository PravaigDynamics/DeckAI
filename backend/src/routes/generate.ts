import { Router } from "express";
import multer from "multer";
import fs from "fs/promises";
import { detectFormat, extractDocument, generateDocument, outputExtension, outputMimeType } from "../fileProcessing";
import { getModelProvider } from "../modelProvider";
import { readBrandReference } from "../brandReference/store";
import { createJob, generatedFilePath, getJob } from "../storage/jobs";

export const generateRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

generateRouter.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Attach a file under the 'file' field." });
    }

    const format = detectFormat(req.file.originalname, req.file.mimetype);
    const extracted = await extractDocument(format, req.file.buffer);

    if (extracted.blocks.length === 0) {
      return res.status(422).json({ error: "No readable text content found in the uploaded file." });
    }

    const brandReference = await readBrandReference();
    const provider = getModelProvider();
    const plan = await provider.planBranding(extracted, brandReference);

    const outputBuffer = await generateDocument(format, extracted, plan);

    const job = await createJob({
      originalName: req.file.originalname,
      format,
      extracted,
      plan,
      generatedPath: "",
    });
    const filePath = generatedFilePath(job, outputExtension(format));
    await fs.writeFile(filePath, outputBuffer);
    job.generatedPath = filePath;

    res.json({
      jobId: job.id,
      format,
      documentTitle: plan.documentTitle ?? extracted.title ?? null,
      reviewNotes: plan.reviewNotes ?? [],
      downloadUrl: `/api/generate/${job.id}/download`,
      mimeType: outputMimeType(format),
    });
  } catch (err) {
    console.error("[generate] failed:", err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

generateRouter.get("/:id/download", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });

  try {
    const buffer = await fs.readFile(job.generatedPath);
    res.setHeader("Content-Type", outputMimeType(job.format));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="branded-${job.originalName.replace(/\.[^.]+$/, "")}.${outputExtension(job.format)}"`,
    );
    res.send(buffer);
  } catch {
    res.status(404).json({ error: "Generated file not found on disk." });
  }
});

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("GEMINI_API_KEY")) {
    return "Model provider is not configured: set GEMINI_API_KEY in backend/.env.";
  }
  if (message.includes("Unsupported file type")) {
    return message;
  }
  if (message.includes("could not be parsed as JSON")) {
    return "The model returned an unexpected response. Please try again.";
  }
  return "Something went wrong while generating the branded file. Please try again.";
}
