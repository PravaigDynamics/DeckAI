import { Router } from "express";
import fs from "fs/promises";
import path from "path";

export const docsRouter = Router();

// README.md lives at the repo root, one level above backend/.
const readmePath = path.resolve(__dirname, "..", "..", "..", "README.md");

/**
 * Serves the project README as raw Markdown so the frontend can show it
 * in-app (Setup/About panel) without duplicating its content. Read-only —
 * there is no write/edit endpoint here.
 */
docsRouter.get("/readme", async (_req, res) => {
  try {
    const markdown = await fs.readFile(readmePath, "utf-8");
    res.type("text/markdown").send(markdown);
  } catch {
    res.status(404).json({ error: "README.md not found on the server." });
  }
});
