// Overview of saved analyses: totals, moderation attention, and the latest records.
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiClock, FiImage, FiUsers } from "react-icons/fi";
import { Link } from "react-router-dom";

import AlertBanner from "../components/AlertBanner";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { StatusBadge, TypeBadge } from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import { getErrorMessage, getStats } from "../services/api";
import { formatDate } from "../utils/format";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getStats()
      .then((data) => {
        if (active) {
          setStats(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError));
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
  }, []);

  // Review and restricted records are the ones that need a person to look at them.
  const attention = (stats?.review_count || 0) + (stats?.restricted_count || 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Counts come from analyses saved in MongoDB. Run an analysis to populate this view."
      >
        <Link className="btn btn-accent" to="/analyze">
          Analyze an image
        </Link>
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <section className="stat-grid" aria-busy={loading}>
        <StatCard icon={<FiClock />} label="Saved analyses" value={loading ? "…" : stats?.total_analyses ?? 0} detail="All stored records" />
        <StatCard icon={<FiImage />} label="Objects detected" value={loading ? "…" : stats?.object_count ?? 0} detail="Sum of label counts" />
        <StatCard icon={<FiUsers />} label="Faces detected" value={loading ? "…" : stats?.face_count ?? 0} detail="Sum of face counts" />
        <StatCard
          icon={<FiAlertTriangle />}
          label="Needs attention"
          value={loading ? "…" : attention}
          detail={`${stats?.review_count ?? 0} review · ${stats?.restricted_count ?? 0} restricted`}
        />
      </section>

      <section className="section-card">
        <header className="section-heading">
          <div>
            <h2>Recent analyses</h2>
            <p>{stats ? `${stats.safe_count} safe records in the database.` : "Latest records from history."}</p>
          </div>
          <Link to="/history">View history</Link>
        </header>
        {loading ? <p className="section-empty">Loading history…</p> : null}
        {!loading && !error && (stats?.recent || []).length === 0 ? (
          <EmptyState icon={<FiImage />} title="No analyses yet" action={<Link className="btn btn-accent" to="/analyze">Upload an image</Link>}>
            Object, face, text, and moderation results will appear here after the first successful analysis.
          </EmptyState>
        ) : null}
        {!loading && (stats?.recent || []).length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Type</th>
                  <th scope="col">Highlights</th>
                  <th scope="col">Moderation</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/history/${item.id}`}>{item.filename}</Link>
                    </td>
                    <td>
                      <TypeBadge type={item.analysis_type} />
                    </td>
                    <td>{item.summary?.top_labels?.length ? item.summary.top_labels.join(", ") : "—"}</td>
                    <td>
                      <StatusBadge status={item.moderation_status} />
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
