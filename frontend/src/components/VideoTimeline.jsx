// Selectable list of the frames that were sent to Rekognition.
import { StatusBadge } from "./StatusBadge";
import { formatTimestamp } from "../utils/format";

export default function VideoTimeline({ video, selectedIndex, onSelect }) {
  const frames = video?.frames || [];
  if (!frames.length) {
    return null;
  }

  return (
    <section className="section-card">
      <header className="section-heading">
        <div>
          <h2>Sampled frames</h2>
          <p>
            {video.frame_count} frames across {formatTimestamp(video.duration_ms)}. Select a frame to inspect that
            moment.
          </p>
        </div>
      </header>
      <div className="frame-strip" role="listbox" aria-label="Sampled frames">
        {frames.map((frame) => {
          const active = frame.index === selectedIndex;
          return (
            <button
              key={frame.index}
              type="button"
              role="option"
              aria-selected={active}
              className={`frame-chip${active ? " is-active" : ""}`}
              onClick={() => onSelect(frame)}
            >
              <strong>{formatTimestamp(frame.timestamp_ms)}</strong>
              <span>{frame.labels?.label_count || 0} items</span>
              <span>{frame.faces?.face_count || 0} faces</span>
              <StatusBadge status={frame.moderation?.status} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
