// Upload an image, run a full Rekognition analysis, and draw boxes on the preview.
import { useState } from "react";
import { Link } from "react-router-dom";

import AlertBanner from "../components/AlertBanner";
import AnalysisResults from "../components/AnalysisResults";
import ImageUpload from "../components/ImageUpload";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../context/SettingsContext";
import { analyzeImage, getErrorMessage } from "../services/api";
import { buildOverlays } from "../utils/overlays";

export default function AnalyzePage() {
  const { settings } = useSettings();
  const [file, setFile] = useState(null);
  const [clientError, setClientError] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [overlayOptions, setOverlayOptions] = useState({ faces: true, objects: false, text: false });

  function onFileChange(nextFile, message) {
    // A validation message means the file was rejected, so nothing stays selected.
    setFile(message ? null : nextFile);
    setClientError(message || "");
    setAnalysis(null);
    setError("");
    setWarning("");
  }

  function onClear() {
    setFile(null);
    setClientError("");
    setAnalysis(null);
    setError("");
    setWarning("");
  }

  async function onAnalyze() {
    if (!file || clientError) {
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    setAnalysis(null);
    try {
      const record = await analyzeImage(file, settings);
      setAnalysis(record);
      // The analysis can succeed even when MongoDB failed to store it.
      setWarning(record.persist_error || "");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Analysis"
        title="Analyze an image"
        description="The image is sent to AWS Rekognition for animals, vehicles, objects, other items, faces, text, and moderation. The file itself is not stored."
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {warning ? <AlertBanner tone="warning">{warning}</AlertBanner> : null}
      {analysis && !warning ? (
        <AlertBanner
          tone="success"
          action={
            analysis.id ? (
              <Link to={`/history/${analysis.id}`}>View saved record</Link>
            ) : null
          }
        >
          Analysis complete.
        </AlertBanner>
      ) : null}

      <ImageUpload
        file={file}
        disabled={loading}
        clientError={clientError}
        overlays={buildOverlays(analysis?.results, overlayOptions)}
        showOverlayControls={Boolean(analysis?.results)}
        overlayOptions={overlayOptions}
        onOverlayOptionsChange={setOverlayOptions}
        onFileChange={onFileChange}
        onClear={onClear}
        onAnalyze={onAnalyze}
      />

      {loading ? (
        <div className="loading-panel" role="status">
          <span className="spinner-border" aria-hidden="true" />
          <div>
            <strong>Rekognition is reading the image</strong>
            <p>Object detection, face detection, text extraction, and moderation run together.</p>
          </div>
        </div>
      ) : null}

      <AnalysisResults analysis={analysis} />
    </div>
  );
}
