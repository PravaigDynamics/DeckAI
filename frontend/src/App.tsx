import { useState } from "react";
import { Uploader } from "./components/Uploader";
import { CorrectionForm } from "./components/CorrectionForm";
import { ReadmeModal } from "./components/ReadmeModal";
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
  const [showReadme, setShowReadme] = useState(false);

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
          <h1>Decks Branded AI</h1>
          <button onClick={() => setShowReadme(true)}>View README</button>
        </div>
        <p>Upload a rough deck, doc, or text file to align it with Pravaig brand guidelines.</p>
      </header>

      {showReadme && <ReadmeModal onClose={() => setShowReadme(false)} />}

      <div className="panel">
        <Uploader onFileSelected={handleFile} disabled={status.kind === "uploading"} />
        {status.kind === "uploading" && <p className="status-line">Applying brand reference…</p>}
        {status.kind === "error" && <p className="status-line error">{status.message}</p>}
      </div>

      {status.kind === "ready" && (
        <>
          <div className="panel">
            <p className="result-title">
              {status.result.documentTitle ?? "Branded draft ready"}
            </p>
            <a href={downloadUrlFor(status.result.downloadUrl)}>
              <button className="primary">Download branded file</button>
            </a>

            {status.result.reviewNotes.length > 0 && (
              <div className="review-notes">
                Notes from the model:
                <ul>
                  {status.result.reviewNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <CorrectionForm onAccept={handleAccept} onCorrect={handleCorrect} busy={reviewBusy} />
          {reviewStatus && <p className="status-line success">{reviewStatus}</p>}
        </>
      )}
    </div>
  );
}
