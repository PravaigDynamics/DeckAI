import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { getJob, updateJobStatus } from "../storage/jobs";
import { submitCorrection } from "../brandReference/corrections";

export const reviewRouter = Router();

const correctionSchema = z.object({
  jobId: z.string(),
  reviewer: z.string().min(1, "Reviewer name is required."),
  correctionText: z.string().min(3, "Correction text is required."),
});

/**
 * Reviewer approves the draft as-is. Restricting this to actual named
 * reviewers (P1) needs real auth; today we only check the submitted name
 * against REVIEWERS in config as a soft gate, not a security boundary.
 */
reviewRouter.post("/accept", (req, res) => {
  const { jobId, reviewer } = req.body ?? {};
  if (!jobId || !reviewer) {
    return res.status(400).json({ error: "jobId and reviewer are required." });
  }
  if (!config.reviewers.includes(reviewer)) {
    return res.status(403).json({ error: `"${reviewer}" is not a recognized brand reviewer.` });
  }
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });

  updateJobStatus(jobId, "accepted");
  res.json({ status: "accepted" });
});

/**
 * Reviewer submits a plain-language correction. This is folded into the
 * living brand reference immediately (P0 learning loop) — it does not just
 * regenerate this one document, it changes future ones too.
 */
reviewRouter.post("/correct", async (req, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
  }
  const { jobId, reviewer, correctionText } = parsed.data;

  if (!config.reviewers.includes(reviewer)) {
    return res.status(403).json({ error: `"${reviewer}" is not a recognized brand reviewer.` });
  }
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });

  try {
    const appendedFragment = await submitCorrection(correctionText, reviewer);
    updateJobStatus(jobId, "corrected");
    res.json({ status: "corrected", appendedFragment });
  } catch (err) {
    console.error("[review/correct] failed:", err);
    res.status(500).json({ error: "Could not save the correction to the brand reference. Please try again." });
  }
});
