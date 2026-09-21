import { useState } from "react";
import { Uploader } from "./components/Uploader";
import { CorrectionForm } from "./components/CorrectionForm";
import { BrandReferenceModal } from "./components/BrandReferenceModal";
import {
  acceptJob,
  downloadUrlFor,
  submitCorrection,
  uploadAndGenerate,
  type GenerateResponse,
} from "./api";

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "ready"; result: GenerateResponse }
  | { kind: "error"; message: string };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [showBrandReference, setShowBrandReference] = useState(false);

  async function handleFile(file: File) {
    setReviewStatus(null);
    setStatus({ kind: "uploading" });
    try {
      const result = await uploadAndGenerate(file);
      setStatus({ kind: "ready", result });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  async function handleAccept(reviewer: string) {
    if (status.kind !== "ready") return;
    setReviewBusy(true);
    try {
      await acceptJob(status.result.jobId, reviewer);
      setReviewStatus("Accepted. No changes were made to the brand reference.");
    } catch (err) {
      setReviewStatus(`Error: ${(err as Error).message}`);
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleCorrect(reviewer: string, correctionText: string) {
    if (status.kind !== "ready") return;
    setReviewBusy(true);
    try {
      await submitCorrection(status.result.jobId, reviewer, correctionText);
      setReviewStatus("Correction saved. It will be applied automatically to future documents.");
    } catch (err) {
      setReviewStatus(`Error: ${(err as Error).message}`);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <span className="eyebrow">PRAVAIG</span>
            <h1>Decks Branded AI</h1>
          </div>
          <button className="ghost" onClick={() => setShowBrandReference(true)}>
            View Brand Reference
          </button>
        </div>
        <p>Upload a rough deck, doc, or text file to align it with Pravaig brand guidelines.</p>
      </header>

      {showBrandReference && <BrandReferenceModal onClose={() => setShowBrandReference(false)} />}

      <Uploader onFileSelected={handleFile} disabled={status.kind === "uploading"} />
      {status.kind === "uploading" && (
        <p className="status-line pending">
          <span className="spinner" aria-hidden="true" />
          Applying brand reference…
        </p>
      )}
      {status.kind === "error" && <p className="status-line error">{status.message}</p>}

      {status.kind === "ready" && (
        <>
          <div className="panel result-panel">
            <span className="result-badge">Branded draft ready</span>
            <p className="result-title">{status.result.documentTitle ?? "Untitled document"}</p>
            <a href={downloadUrlFor(status.result.downloadUrl)}>
              <button className="primary">Download branded file</button>
            </a>

            {status.result.reviewNotes.length > 0 && (
              <div className="review-notes">
                <span className="review-notes-label">Notes from the model</span>
                <ul>
                  {status.result.reviewNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <CorrectionForm onAccept={handleAccept} onCorrect={handleCorrect} busy={reviewBusy} />
          {reviewStatus && (
            <p className={`status-line ${reviewStatus.startsWith("Error") ? "error" : "success"}`}>
              {reviewStatus}
            </p>
          )}
        </>
      )}

      <footer className="app-footer">PRIVATE &amp; CONFIDENTIAL · PRAVAIG {new Date().getFullYear()}</footer>
    </div>
  );
}
