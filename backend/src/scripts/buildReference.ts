import { buildOrUpdateBrandReference } from "../brandReference/builder";

buildOrUpdateBrandReference()
  .then(({ processed, skipped }) => {
    console.log(`Processed: ${processed.join(", ") || "(none)"}`);
    console.log(`Skipped (already up to date or unsupported): ${skipped.join(", ") || "(none)"}`);
  })
  .catch((err) => {
    console.error("Failed to build brand reference:", err);
    process.exit(1);
  });
