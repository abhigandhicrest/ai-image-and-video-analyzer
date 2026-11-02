// Drag-and-drop or browse for a short video, preview it, and draw frame boxes on top.
import { useEffect, useRef, useState } from "react";
import { FiUploadCloud, FiVideo } from "react-icons/fi";

import { formatBytes } from "../utils/format";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SECONDS = 60;

function validateFile(file) {
  // Client-side checks match the API: MP4, MOV, or WebM, non-empty, at most 50 MB.
  const name = file.name.toLowerCase();
  const extensionOk = [".mp4", ".mov", ".webm"].some((extension) => name.endsWith(extension));
  if (!extensionOk) {
    return "Upload an MP4, MOV, or WebM video.";
  }
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_BYTES) {
    return "Video must be 50 MB or smaller.";
  }
  return "";
}

function readDuration(file) {
  // Ask the browser for the duration before the upload. A decode failure leaves the server to decide.
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const finish = (duration) => {
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export default function VideoUpload({
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
  videoRef,
}) {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const requestId = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      setPlaying(false);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPlaying(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function chooseFile(nextFile) {
    if (!nextFile || disabled) {
      return;
    }
    const current = requestId.current + 1;
    requestId.current = current;
    const message = validateFile(nextFile);
    if (message) {
      onFileChange(nextFile, message);
      return;
    }
    const duration = await readDuration(nextFile);
    if (current !== requestId.current) {
      return;
    }
    if (duration !== null && duration > MAX_SECONDS + 0.05) {
      onFileChange(nextFile, "Video must be 60 seconds or shorter.");
      return;
    }
    onFileChange(nextFile, "");
  }

  function onDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  const visibleOverlays = playing ? [] : overlays;

  return (
    <section className="section-card upload-card">
      <header className="section-heading">
        <div>
          <h2>Upload</h2>
          <p>MP4, MOV, or WebM. Maximum 50 MB and 60 seconds.</p>
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
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {visibleOverlays.map((overlay) => (
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
            <strong>Drag a video here</strong>
            <span>or browse from this device</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {clientError ? <p className="field-error">{clientError}</p> : null}

      <div className="upload-toolbar">
        <div className="file-meta">
          <FiVideo aria-hidden="true" />
          {file ? (
            <span>
              {file.name} · {formatBytes(file.size)}
            </span>
          ) : (
            <span>No video selected</span>
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
              "Analyze video"
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
