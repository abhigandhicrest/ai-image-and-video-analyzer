// Compact API status in the top bar. Mongo being down is a warning, not a full outage.
export default function HealthPill({ health, loading }) {
  if (loading) {
    return <span className="health-pill">Checking API…</span>;
  }
  if (!health) {
    return <span className="health-pill is-down">API offline</span>;
  }

  const mongoDown = health.mongo !== "connected";
  const label = mongoDown ? "Database offline" : "API online";

  return (
    <span className={`health-pill${mongoDown ? " is-warn" : " is-ok"}`} title={`Region ${health.aws_region}`}>
      {label}
    </span>
  );
}
