// Placeholder used when a list or dashboard has nothing to show yet.
export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
