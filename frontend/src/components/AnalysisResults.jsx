// Renders whichever result sections the analysis actually contains.
import { StatusBadge, TypeBadge } from "./StatusBadge";
import FacesPanel from "./results/FacesPanel";
import ModerationPanel from "./results/ModerationPanel";
import ObjectsPanel from "./results/ObjectsPanel";
import TextPanel from "./results/TextPanel";
import { formatBytes, formatDate, formatTimestamp } from "../utils/format";

export default function AnalysisResults({ analysis }) {
  if (!analysis) {
    return null;
  }

  const results = analysis.results || {};
  const summary = analysis.summary || {};

  return (
    <div className="results-stack">
      <div className="result-meta">
        <div>
          <TypeBadge type={analysis.analysis_type} />
          <StatusBadge status={analysis.moderation_status} />
        </div>
        <p>
          {analysis.filename} · {formatBytes(analysis.file_size)} · {formatDate(analysis.created_at)}
          {results.video ? ` · ${formatTimestamp(results.video.duration_ms)} · ${results.video.frame_count} frames` : ""}
        </p>
      </div>
      {results.video ? (
        <p className="section-note">
          Combined counts use every sampled frame. The face list is the busiest frame. An item's detection count is how
          many sampled frames included it.
        </p>
      ) : null}

      <div className="mini-stats">
        <div>
          <span>Objects</span>
          <strong>{summary.label_count ?? results.labels?.label_count ?? 0}</strong>
        </div>
        <div>
          <span>Faces</span>
          <strong>{summary.face_count ?? results.faces?.face_count ?? 0}</strong>
        </div>
        <div>
          <span>Text lines</span>
          <strong>{summary.text_count ?? results.text?.line_count ?? 0}</strong>
        </div>
        <div>
          <span>Moderation labels</span>
          <strong>{results.moderation?.label_count ?? 0}</strong>
        </div>
      </div>

      {"labels" in results && results.labels ? <ObjectsPanel data={results.labels} /> : null}
      {"faces" in results && results.faces ? <FacesPanel data={results.faces} /> : null}
      {"text" in results && results.text ? <TextPanel data={results.text} /> : null}
      {"moderation" in results && results.moderation ? <ModerationPanel data={results.moderation} /> : null}
    </div>
  );
}
