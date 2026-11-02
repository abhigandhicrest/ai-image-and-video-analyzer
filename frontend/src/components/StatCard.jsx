// One dashboard metric: icon, label, number, and a short explanation.
export default function StatCard({ icon, label, value, detail }) {
  return (
    <article className="stat-card">
      <div className="stat-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {detail ? <p className="stat-detail">{detail}</p> : null}
      </div>
    </article>
  );
}
