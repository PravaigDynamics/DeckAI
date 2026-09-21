import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  MODEL_PROVIDER: z.string().default("gemini"),
  GEMINI_API_KEY: z.string().optional().default(""),
  // "gemini-flash-lite-latest" is a Google-maintained alias (avoids the
  // gemini-2.0-flash-style pinned-version deprecation) for their current
  // lite flash model. Measured directly against the live API: the full
  // "gemini-flash-latest" alias was intermittently 503ing / taking 8s+
  // under a realistic prompt size, while the lite alias responded in
  // ~1-2s consistently — better fit for a text-restructuring task where
  // reliability matters more than the deepest reasoning tier. Swappable
  // via this env var alone if quality needs outweigh latency later.
  GEMINI_MODEL: z.string().default("gemini-flash-lite-latest"),

  DATA_DIR: z.string().default("./data"),
  BRAND_SOURCE_DIR: z.string().default("./brand-source"),
  BRAND_REFERENCE_PATH: z.string().default("./data/brand-reference.md"),
  UPLOADS_DIR: z.string().default("./data/uploads"),
  GENERATED_DIR: z.string().default("./data/generated"),

  REVIEWERS: z.string().default("Monika,Ram"),

  // Real Pravaig decks (e.g. the sample induction PPTX) run 40MB+, so the
  // default headroom is set well above that rather than a generic small
  // default that would reject legitimate company files.
  MAX_UPLOAD_MB: z.coerce.number().default(60),
});

const parsed = schema.parse(process.env);

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export const config = {
  port: parsed.PORT,
  corsOrigins: parsed.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),

  modelProvider: parsed.MODEL_PROVIDER,
  gemini: {
    apiKey: parsed.GEMINI_API_KEY,
    model: parsed.GEMINI_MODEL,
  },

  dataDir: resolvePath(parsed.DATA_DIR),
  brandSourceDir: resolvePath(parsed.BRAND_SOURCE_DIR),
  brandReferencePath: resolvePath(parsed.BRAND_REFERENCE_PATH),
  uploadsDir: resolvePath(parsed.UPLOADS_DIR),
  generatedDir: resolvePath(parsed.GENERATED_DIR),

  reviewers: parsed.REVIEWERS.split(",").map((s) => s.trim()).filter(Boolean),

  maxUploadMb: parsed.MAX_UPLOAD_MB,
};
