// Drag-and-drop or browse for a JPG/PNG, preview it, and draw result boxes on top.
import { useEffect, useRef, useState } from "react";
import { FiImage, FiUploadCloud } from "react-icons/fi";

import { formatBytes } from "../utils/format";

const MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file) {
  // Client-side checks match the API: JPG or PNG, non-empty, at most 5 MB.
  const name = file.name.toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png"].some((extension) => name.endsWith(extension));
  const blocked = ["image/gif", "image/webp", "image/bmp", "image/svg+xml"].includes(file.type);
  if (!extensionOk || blocked) {
    return "Upload a JPG, JPEG, or PNG image.";
  }
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return "";
}

export default function ImageUpload({
  file,
  disabled,
  overlays = [],
  showOverlayControls = false,
  overlayOptions,
  onOverlayOptionsChange,
  onFileChange,
  onClear,
  onAnalyze,
  clientError,
}) {
  const inputRef = useRef(null);
  // Count nested dragenter/dragleave events so the highlight stays on while the pointer is inside.
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    // Revoke the object URL when the file changes or the component unmounts.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(nextFile) {
    if (!nextFile || disabled) {
      return;
    }
    const message = validateFile(nextFile);
    onFileChange(nextFile, message);
  }

  function onDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="section-card upload-card">
      <header className="section-heading">
        <div>
          <h2>Upload</h2>
          <p>JPG, JPEG, or PNG. Maximum size 5 MB.</p>
        </div>
      </header>

      <div
        className={`dropzone${dragOver ? " is-dragover" : ""}${disabled ? " is-disabled" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragOver(false);
          }
        }}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <div className="preview-frame">
            <img src={previewUrl} alt={file?.name || "Selected upload"} draggable="false" />
            {overlays.map((overlay) => (
              // Boxes are fractions of the image, so percentages line them up on the preview.
              <div
                key={overlay.id}
                className={`box-overlay tone-${overlay.tone}`}
                style={{
                  left: `${overlay.box.left * 100}%`,
                  top: `${overlay.box.top * 100}%`,
                  width: `${overlay.box.width * 100}%`,
                  height: `${overlay.box.height * 100}%`,
                }}
              >
                <span>{overlay.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dropzone-empty">
            <FiUploadCloud aria-hidden="true" />
            <strong>Drag an image here</strong>
            <span>or browse from this device</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          // Clear the input so picking the same file again still fires change.
          event.target.value = "";
        }}
      />

      {clientError ? <p className="field-error">{clientError}</p> : null}

      <div className="upload-toolbar">
        <div className="file-meta">
          <FiImage aria-hidden="true" />
          {file ? (
            <span>
              {file.name} · {formatBytes(file.size)}
            </span>
          ) : (
            <span>No image selected</span>
          )}
        </div>
        <div className="upload-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Browse files
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onClear} disabled={!file || disabled}>
            Clear
          </button>
          <button type="button" className="btn btn-accent" onClick={onAnalyze} disabled={!file || disabled || Boolean(clientError)}>
            {disabled ? (
              <>
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                Analyzing with Rekognition…
              </>
            ) : (
              "Analyze image"
            )}
          </button>
        </div>
      </div>

      {showOverlayControls ? (
        <fieldset className="overlay-options">
          <legend>Preview overlays</legend>
          {[
            ["faces", "Faces"],
            ["objects", "Objects"],
            ["text", "Text"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={overlayOptions[key]}
                onChange={(event) => onOverlayOptionsChange({ ...overlayOptions, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
    </section>
  );
}
