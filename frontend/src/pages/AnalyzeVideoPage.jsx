// Upload a short video, sample frames on the server, and draw the selected frame's boxes.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import AlertBanner from "../components/AlertBanner";
import AnalysisResults from "../components/AnalysisResults";
import FrameResults from "../components/FrameResults";
import PageHeader from "../components/PageHeader";
import VideoTimeline from "../components/VideoTimeline";
import VideoUpload from "../components/VideoUpload";
import { useSettings } from "../context/SettingsContext";
import { analyzeVideo, getErrorMessage } from "../services/api";
import { buildOverlays } from "../utils/overlays";

export default function AnalyzeVideoPage() {
  const { settings } = useSettings();
  const videoRef = useRef(null);
  const [file, setFile] = useState(null);
  const [clientError, setClientError] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [overlayOptions, setOverlayOptions] = useState({ faces: true, objects: false, text: false });

  const frames = analysis?.results?.video?.frames || [];
  const selectedFrame = frames.find((frame) => frame.index === selectedIndex) || null;

  useEffect(() => {
    const nextFrames = analysis?.results?.video?.frames || [];
    setSelectedIndex(nextFrames.length ? nextFrames[0].index : null);
  }, [analysis]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !selectedFrame) {
      return undefined;
    }
    const seek = () => {
      node.pause();
      const target = selectedFrame.timestamp_ms / 1000;
      if (Math.abs(node.currentTime - target) > 0.05) {
        node.currentTime = target;
      }
    };
    if (node.readyState >= 1) {
      seek();
      return undefined;
    }
    node.addEventListener("loadedmetadata", seek);
    return () => node.removeEventListener("loadedmetadata", seek);
  }, [selectedFrame]);

  function onFileChange(nextFile, message) {
    setFile(message ? null : nextFile);
    setClientError(message || "");
    setAnalysis(null);
    setSelectedIndex(null);
    setError("");
    setWarning("");
  }

  function onClear() {
    setFile(null);
    setClientError("");
    setAnalysis(null);
    setSelectedIndex(null);
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
    setSelectedIndex(null);
    try {
      const record = await analyzeVideo(file, settings);
      setAnalysis(record);
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
        title="Analyze a video"
        description="Six frames are sampled on the server and each one is sent to the same Rekognition image APIs as a photo. The video is not uploaded to S3 and is not stored."
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {warning ? <AlertBanner tone="warning">{warning}</AlertBanner> : null}
      {analysis && !warning ? (
        <AlertBanner
          tone="success"
          action={analysis.id ? <Link to={`/history/${analysis.id}`}>View saved record</Link> : null}
        >
          Analysis complete.
        </AlertBanner>
      ) : null}

      <VideoUpload
        file={file}
        disabled={loading}
        clientError={clientError}
        videoRef={videoRef}
        overlays={buildOverlays(selectedFrame, overlayOptions)}
        showOverlayControls={Boolean(selectedFrame)}
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
            <strong>Rekognition is reading the sampled frames</strong>
            <p>Object detection, face detection, text extraction, and moderation run for each frame.</p>
          </div>
        </div>
      ) : null}

      {analysis?.results?.video ? (
        <VideoTimeline
          video={analysis.results.video}
          selectedIndex={selectedIndex}
          onSelect={(frame) => setSelectedIndex(frame.index)}
        />
      ) : null}

      <AnalysisResults analysis={analysis} />
      <FrameResults frame={selectedFrame} live />
    </div>
  );
}
