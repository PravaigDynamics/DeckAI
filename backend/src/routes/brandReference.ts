import { Router } from "express";
import { readBrandReference, listBrandReferenceVersions } from "../brandReference/store";
import { buildOrUpdateBrandReference } from "../brandReference/builder";

export const brandReferenceRouter = Router();

brandReferenceRouter.get("/", async (_req, res) => {
  const markdown = await readBrandReference();
  res.type("text/markdown").send(markdown);
});

brandReferenceRouter.get("/versions", async (_req, res) => {
  const versions = await listBrandReferenceVersions();
  res.json({ versions });
});

/**
 * Triggers a (re)scan of brand-source/ and folds in any new/changed files.
 * In this build this is a manual trigger; wiring it to an OneDrive/NAS
 * mirror job (per the PRD) or a folder-watcher is the documented extension.
 */
brandReferenceRouter.post("/rebuild", async (_req, res) => {
  try {
    const result = await buildOrUpdateBrandReference();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
