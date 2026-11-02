// Horizontal meter for a 0–100 confidence score.
import { formatConfidence } from "../utils/format";

export default function ConfidenceBar({ value, tone = "good" }) {
  // Clamp so a bad value cannot draw a bar past the track.
  const amount = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="confidence">
      <div
        className="confidence-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(amount)}
        aria-label="Confidence"
      >
        <span className={`confidence-fill tone-${tone}`} style={{ width: `${amount}%` }} />
      </div>
      <span className="confidence-value">{formatConfidence(value)}</span>
    </div>
  );
}
