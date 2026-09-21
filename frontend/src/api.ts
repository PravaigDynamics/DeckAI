const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface GenerateResponse {
  jobId: string;
  format: "docx" | "pptx" | "text";
  documentTitle: string | null;
  reviewNotes: string[];
  downloadUrl: string;
  mimeType: string;
}

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return body;
}

export async function uploadAndGenerate(file: File): Promise<GenerateResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/generate`, {
    method: "POST",
    body: formData,
  });
  return parseJsonOrThrow(res);
}

export function downloadUrlFor(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function acceptJob(jobId: string, reviewer: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/review/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, reviewer }),
  });
  await parseJsonOrThrow(res);
}

export async function fetchReadme(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/docs/readme`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not load README.");
  }
  return res.text();
}

export async function submitCorrection(
  jobId: string,
  reviewer: string,
  correctionText: string,
): Promise<{ appendedFragment: string }> {
  const res = await fetch(`${API_BASE_URL}/api/review/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, reviewer, correctionText }),
  });
  return parseJsonOrThrow(res);
}
