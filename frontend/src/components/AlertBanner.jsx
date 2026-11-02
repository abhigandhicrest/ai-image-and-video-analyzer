// Inline notice. Errors use an alert role so assistive tech announces them.
export default function AlertBanner({ tone = "info", children, action }) {
  if (!children) {
    return null;
  }

  return (
    <div className={`alert-banner tone-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <p>{children}</p>
      {action}
    </div>
  );
}
