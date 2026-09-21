import { getModelProvider } from "../modelProvider";
import { appendToBrandReference, readBrandReference } from "./store";

/**
 * Folds a reviewer's plain-language correction into the living brand
 * reference. This is the P0 learning-loop requirement from the PRD: once
 * appended, planBranding() picks up the new rule automatically on the next
 * document because it always reads the current reference file.
 */
export async function submitCorrection(correctionText: string, reviewer: string): Promise<string> {
  const currentReference = await readBrandReference();
  const provider = getModelProvider();
  const fragment = await provider.draftReferenceUpdate(correctionText, currentReference);
  await appendToBrandReference(fragment, `reviewer correction (${reviewer})`);
  return fragment;
}
