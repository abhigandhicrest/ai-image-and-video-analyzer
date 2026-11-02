// Paginated list of saved analyses, with type filters, filename search, and delete.
import { useEffect, useState } from "react";
import { FiClock, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router-dom";

import AlertBanner from "../components/AlertBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { StatusBadge, TypeBadge } from "../components/StatusBadge";
import { deleteHistoryItem, getErrorMessage, getHistory } from "../services/api";
import { STATUS_LABELS, formatBytes, formatDate } from "../utils/format";

const FILTERS = [
  ["", "All"],
  ["full", "Full"],
  ["labels", "Objects"],
  ["faces", "Faces"],
  ["text", "Text"],
  ["moderation", "Moderation"],
  ["video", "Video"],
];

const LIMIT = 8;

function highlights(item) {
  // One short line for the table: group counts, then names, then type-specific fallbacks.
  const summary = item.summary || {};
  const kinds = [
    summary.animal_count ? `${summary.animal_count} animals` : "",
    summary.vehicle_count ? `${summary.vehicle_count} vehicles` : "",
    summary.object_count ? `${summary.object_count} objects` : "",
    summary.other_count ? `${summary.other_count} other` : "",
  ].filter(Boolean);
  if (kinds.length) {
    const names = summary.top_labels?.length ? ` — ${summary.top_labels.join(", ")}` : "";
    return `${kinds.join(" · ")}${names}`;
  }
  if (summary.top_labels?.length) {
    return summary.top_labels.join(", ");
  }
  if (item.analysis_type === "video") {
    const bits = [
      summary.face_count ? `${summary.face_count} faces in the busiest frame` : "",
      summary.text_count ? `${summary.text_count} text lines` : "",
    ].filter(Boolean);
    if (bits.length) {
      return bits.join(" · ");
    }
  }
  if (item.analysis_type === "faces") {
    return `${item.summary?.face_count || 0} faces`;
  }
  if (item.analysis_type === "text") {
    return `${item.summary?.text_count || 0} text lines`;
  }
  if (item.analysis_type === "moderation") {
    return STATUS_LABELS[item.moderation_status] || "—";
  }
  return "—";
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [analysisType, setAnalysisType] = useState("");
  const [filenameInput, setFilenameInput] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    // Ignore the response if the user changed page or filter before it arrived.
    setLoading(true);
    getHistory({ limit: LIMIT, skip, analysisType, filename })
      .then((data) => {
        if (!active) {
          return;
        }
        setItems(data.items || []);
        setTotal(data.total || 0);
        setError("");
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError));
          setItems([]);
          setTotal(0);
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
  }, [skip, analysisType, filename]);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    try {
      await deleteHistoryItem(pendingDelete.id);
      setPendingDelete(null);
      // Deleting the last row on a later page steps back so the list is not empty.
      const nextSkip = items.length === 1 && skip > 0 ? Math.max(0, skip - LIMIT) : skip;
      if (nextSkip !== skip) {
        setSkip(nextSkip);
      } else {
        const data = await getHistory({ limit: LIMIT, skip, analysisType, filename });
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeleting(false);
    }
  }

  const page = Math.floor(skip / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const filtered = Boolean(analysisType || filename);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Records"
        title="Analysis history"
        description="Stored filenames, scores, and structured results. Image and video files are not kept."
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <section className="section-card">
        <div className="history-filters">
          <div className="filter-group" role="group" aria-label="Filter by analysis type">
            {FILTERS.map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={analysisType === value ? "is-active" : ""}
                onClick={() => {
                  setAnalysisType(value);
                  setSkip(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="filename-search"
            onSubmit={(event) => {
              event.preventDefault();
              setFilename(filenameInput.trim());
              setSkip(0);
            }}
          >
            <label className="visually-hidden" htmlFor="filename-search">
              Search by filename
            </label>
            <input
              id="filename-search"
              value={filenameInput}
              onChange={(event) => setFilenameInput(event.target.value)}
              placeholder="Search filename"
            />
            <button type="submit" className="btn btn-outline-secondary">
              Search
            </button>
          </form>
        </div>

        {loading ? <p className="section-empty">Loading records…</p> : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            icon={<FiClock />}
            title={filtered ? "No records match this filter" : "No analyses yet"}
            action={filtered ? null : <Link className="btn btn-accent" to="/analyze">Analyze an image</Link>}
          >
            {filtered
              ? "Try another type or clear the filename search."
              : "Completed analyses are listed here and can be opened or deleted."}
          </EmptyState>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="table-wrap d-none d-lg-block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Type</th>
                    <th scope="col">Size</th>
                    <th scope="col">Highlights</th>
                    <th scope="col">Moderation</th>
                    <th scope="col">When</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/history/${item.id}`}>{item.filename}</Link>
                      </td>
                      <td>
                        <TypeBadge type={item.analysis_type} />
                      </td>
                      <td>{formatBytes(item.file_size)}</td>
                      <td>{highlights(item)}</td>
                      <td>
                        <StatusBadge status={item.moderation_status} />
                      </td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>
                        <button type="button" className="icon-button" aria-label={`Delete ${item.filename}`} onClick={() => setPendingDelete(item)}>
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="history-cards d-lg-none">
              {items.map((item) => (
                <article key={item.id} className="history-card">
                  <div>
                    <Link to={`/history/${item.id}`}>{item.filename}</Link>
                    <p>
                      {formatBytes(item.file_size)} · {formatDate(item.created_at)}
                    </p>
                    <div className="badge-row">
                      <TypeBadge type={item.analysis_type} />
                      <StatusBadge status={item.moderation_status} />
                    </div>
                  </div>
                  <button type="button" className="icon-button" aria-label={`Delete ${item.filename}`} onClick={() => setPendingDelete(item)}>
                    <FiTrash2 />
                  </button>
                </article>
              ))}
            </div>

            <div className="pager">
              <p>
                Showing {skip + 1}–{Math.min(skip + items.length, total)} of {total}
              </p>
              <div>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - LIMIT))}>
                  Previous
                </button>
                <span>
                  {page} / {pages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={skip + LIMIT >= total}
                  onClick={() => setSkip(skip + LIMIT)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this analysis?"
        message={pendingDelete ? `${pendingDelete.filename} will be removed from history.` : ""}
        busy={deleting}
        onCancel={() => {
          if (!deleting) {
            setPendingDelete(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
