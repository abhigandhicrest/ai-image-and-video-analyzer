// One saved analysis, loaded by id, with the same result panels as a fresh run.
import { useEffect, useState } from "react";
import { FiArrowLeft, FiTrash2 } from "react-icons/fi";
import { Link, useNavigate, useParams } from "react-router-dom";

import AlertBanner from "../components/AlertBanner";
import AnalysisResults from "../components/AnalysisResults";
import ConfirmDialog from "../components/ConfirmDialog";
import FrameResults from "../components/FrameResults";
import PageHeader from "../components/PageHeader";
import VideoTimeline from "../components/VideoTimeline";
import { deleteHistoryItem, getErrorMessage, getHistoryItem } from "../services/api";

export default function HistoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  useEffect(() => {
    let active = true;
    // Drop a late response when the route id has already changed.
    setLoading(true);
    setSelectedIndex(null);
    getHistoryItem(id)
      .then((data) => {
        if (active) {
          setAnalysis(data);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError));
          setAnalysis(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteHistoryItem(id);
      navigate("/history");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Record"
        title={analysis?.filename || "Analysis detail"}
        description={
          analysis?.analysis_type === "video"
            ? "The original video is not stored. Sampled frame scores are saved with this record."
            : "Bounding boxes are normalized coordinates because the original image is not stored."
        }
      >
        <Link className="btn btn-outline-secondary" to="/history">
          <FiArrowLeft aria-hidden="true" /> Back
        </Link>
        {analysis ? (
          <button type="button" className="btn btn-outline-danger" onClick={() => setConfirming(true)}>
            <FiTrash2 aria-hidden="true" /> Delete
          </button>
        ) : null}
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {loading ? <p className="section-empty">Loading analysis…</p> : null}
      {!loading && analysis ? <AnalysisResults analysis={analysis} /> : null}
      {!loading && analysis?.results?.video ? (
        <VideoTimeline
          video={analysis.results.video}
          selectedIndex={selectedIndex}
          onSelect={(frame) => setSelectedIndex((current) => (current === frame.index ? null : frame.index))}
        />
      ) : null}
      {!loading ? (
        <FrameResults frame={analysis?.results?.video?.frames?.find((frame) => frame.index === selectedIndex)} />
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this analysis?"
        message="This removes the saved scores and labels. The action cannot be undone."
        busy={deleting}
        onCancel={() => {
          if (!deleting) {
            setConfirming(false);
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
