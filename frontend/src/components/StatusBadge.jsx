// Small pills for moderation status and analysis type.
import { STATUS_LABELS, TYPE_LABELS } from "../utils/format";

export function StatusBadge({ status }) {
  if (!status) {
    return <span className="status-badge tone-neutral">Not rated</span>;
  }
  return <span className={`status-badge tone-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function TypeBadge({ type }) {
  return <span className="type-badge">{TYPE_LABELS[type] || type}</span>;
}
