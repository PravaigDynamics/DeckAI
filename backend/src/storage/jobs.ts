import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "../config";
import type { ExtractedDocument, BrandingPlan } from "../modelProvider/types";
import type { SupportedFormat } from "../fileProcessing";

/**
 * Minimal in-memory + on-disk job store for the upload -> generate -> review
 * flow. Good enough for a single-instance local/first-deploy setup; a real
 * DB-backed job table is the natural next step if this needs to survive
 * restarts or scale horizontally (noted here rather than half-built).
 */
export interface Job {
  id: string;
  originalName: string;
  format: SupportedFormat;
  extracted: ExtractedDocument;
  plan: BrandingPlan;
  generatedPath: string;
  createdAt: string;
  status: "draft" | "accepted" | "corrected";
}

const jobs = new Map<string, Job>();

export async function createJob(input: Omit<Job, "id" | "createdAt" | "status">): Promise<Job> {
  await fs.mkdir(config.generatedDir, { recursive: true });
  const job: Job = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "draft",
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJobStatus(id: string, status: Job["status"]): void {
  const job = jobs.get(id);
  if (job) job.status = status;
}

export function generatedFilePath(job: Job, extension: string): string {
  return path.join(config.generatedDir, `${job.id}.${extension}`);
}
