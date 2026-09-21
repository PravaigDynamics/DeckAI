import { useState } from "react";

interface Props {
  onAccept: (reviewer: string) => Promise<void>;
  onCorrect: (reviewer: string, correctionText: string) => Promise<void>;
  busy: boolean;
}

export function CorrectionForm({ onAccept, onCorrect, busy }: Props) {
  const [reviewer, setReviewer] = useState("");
  const [correctionText, setCorrectionText] = useState("");

  return (
    <div className="panel">
      <span className="field-label">Reviewer name (e.g. Monika or Ram)</span>
      <input
        type="text"
        value={reviewer}
        onChange={(e) => setReviewer(e.target.value)}
        placeholder="Your name"
        disabled={busy}
      />

      <span className="field-label">Correction (plain language, optional)</span>
      <textarea
        value={correctionText}
        onChange={(e) => setCorrectionText(e.target.value)}
        placeholder="e.g. Charts should be sixty percent of the page with the heading top left."
        disabled={busy}
      />

      <div style={{ marginTop: "0.9rem" }}>
        <button
          className="primary"
          disabled={busy || !reviewer}
          onClick={() => onAccept(reviewer)}
        >
          Accept as-is
        </button>
        <button
          disabled={busy || !reviewer || !correctionText.trim()}
          onClick={async () => {
            await onCorrect(reviewer, correctionText);
            setCorrectionText("");
          }}
        >
          Submit correction
        </button>
      </div>
    </div>
  );
}
