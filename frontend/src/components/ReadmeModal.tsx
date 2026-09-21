import { useEffect, useState } from "react";
import { fetchReadme } from "../api";

interface Props {
  onClose: () => void;
}

/**
 * Minimal, dependency-free Markdown rendering — just enough for a README
 * (headings, bullets, fenced code, bold, links). Not a general Markdown
 * engine; swap in a real renderer (e.g. react-markdown) if richer docs
 * content is added later.
 */
function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const elements: JSX.Element[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (listBuffer.length) {
      elements.push(
        <ul key={key++}>
          {listBuffer.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (codeBuffer === null) {
        flushList();
        codeBuffer = [];
      } else {
        elements.push(
          <pre key={key++} className="readme-code">
            <code>{codeBuffer.join("\n")}</code>
          </pre>,
        );
        codeBuffer = null;
      }
      continue;
    }
    if (codeBuffer !== null) {
      codeBuffer.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (level === 1 ? "h2" : level === 2 ? "h3" : "h4") as keyof JSX.IntrinsicElements;
      elements.push(<Tag key={key++} dangerouslySetInnerHTML={{ __html: inlineFormat(text) }} />);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      continue;
    }

    flushList();
    if (line.trim() === "") continue;
    if (line.trim() === "---") {
      elements.push(<hr key={key++} />);
      continue;
    }
    elements.push(<p key={key++} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
  }
  flushList();

  return elements;
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ReadmeModal({ onClose }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReadme()
      .then(setMarkdown)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>README</span>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          {error && <p className="status-line error">{error}</p>}
          {!error && !markdown && <p className="status-line">Loading…</p>}
          {markdown && <div className="readme-content">{renderMarkdown(markdown)}</div>}
        </div>
      </div>
    </div>
  );
}
