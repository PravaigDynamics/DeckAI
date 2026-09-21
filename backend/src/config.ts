import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  MODEL_PROVIDER: z.string().default("gemini"),
  GEMINI_API_KEY: z.string().optional().default(""),
  // "gemini-flash-latest" is a Google-maintained alias for their current
  // recommended flash model, rather than a pinned dated version — avoids
  // repeating the earlier gemini-2.0-flash deprecation and tends to have
  // better availability than a freshly released dated model under load.
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),

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
