// Moderation status banner and the labels that crossed the review threshold.
import ConfidenceBar from "../ConfidenceBar";
import { StatusBadge } from "../StatusBadge";
import { STATUS_LABELS, riskTone } from "../../utils/format";

const STATUS_COPY = {
  safe: "No moderation label reached the review threshold.",
  review: "At least one moderation label reached the review threshold.",
  restricted: "At least one moderation label reached the restricted threshold.",
};

export default function ModerationPanel({ data }) {
  const labels = data?.labels || [];
  const status = data?.status || "safe";

  return (
    <section className="section-card">
      <header className="section-heading">
        <div>
          <h2>Content moderation</h2>
          <p>
            Review at {data?.review_threshold ?? "—"}% · Restricted at {data?.restricted_threshold ?? "—"}%
          </p>
        </div>
        <StatusBadge status={status} />
      </header>
      <div className={`moderation-banner tone-${status}`}>
        <strong>{STATUS_LABELS[status] || status}</strong>
        <span>{STATUS_COPY[status]}</span>
      </div>
      {labels.length === 0 ? (
        <p className="section-empty">No moderation labels were returned at or above the review threshold.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Parent</th>
                <th scope="col">Level</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={`${label.parent || "root"}-${label.name}`}>
                  <td>
                    <strong>{label.name}</strong>
                  </td>
                  <td>{label.parent || "—"}</td>
                  <td>{label.taxonomy_level ?? "—"}</td>
                  <td>
                    <ConfidenceBar value={label.confidence} tone={riskTone(label.confidence)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
