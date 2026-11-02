// Result panels for one sampled video frame.
import FacesPanel from "./results/FacesPanel";
import ModerationPanel from "./results/ModerationPanel";
import ObjectsPanel from "./results/ObjectsPanel";
import TextPanel from "./results/TextPanel";
import { formatTimestamp } from "../utils/format";

export default function FrameResults({ frame, live = false }) {
  if (!frame) {
    return null;
  }

  return (
    <div className="results-stack">
      <header className="section-heading">
        <div>
          <h2>Frame at {formatTimestamp(frame.timestamp_ms)}</h2>
          <p>
            {live
              ? "Boxes on the player match this frame while the video is paused."
              : "The original video is not stored. These are the scores saved for this moment."}
          </p>
        </div>
      </header>
      {frame.labels ? <ObjectsPanel data={frame.labels} /> : null}
      {frame.faces ? <FacesPanel data={frame.faces} /> : null}
      {frame.text ? <TextPanel data={frame.text} /> : null}
      {frame.moderation ? <ModerationPanel data={frame.moderation} /> : null}
    </div>
  );
}
