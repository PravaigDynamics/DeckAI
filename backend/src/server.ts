import express from "express";
import cors from "cors";
import { config } from "./config";
import { ensureBrandReferenceExists } from "./brandReference/store";
import { generateRouter } from "./routes/generate";
import { reviewRouter } from "./routes/review";
import { brandReferenceRouter } from "./routes/brandReference";
import { docsRouter } from "./routes/docs";

async function main() {
  await ensureBrandReferenceExists();

  const app = express();
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", modelProvider: config.modelProvider });
  });

  app.use("/api/generate", generateRouter);
  app.use("/api/review", reviewRouter);
  app.use("/api/brand-reference", brandReferenceRouter);
  app.use("/api/docs", docsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[unhandled]", err);
    res.status(500).json({ error: "Unexpected server error." });
  });

  app.listen(config.port, () => {
    console.log(`Decks Branded AI backend listening on http://localhost:${config.port}`);
    console.log(`Model provider: ${config.modelProvider}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
