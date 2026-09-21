import { useRef, useState } from "react";

interface Props {
  onFileSelected: (file: File) => void;
  disabled: boolean;
}

export function Uploader({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelected(file);
      }}
    >
      <p>
        Drop a .docx, .pptx, or .txt file here, or{" "}
        <span className="dropzone-hint">click to choose one</span>.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pptx,.txt"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
    </div>
  );
}
