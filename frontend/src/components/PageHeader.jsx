// Page title block. Also sets the browser tab title from the page name.
import { useEffect } from "react";

export default function PageHeader({ eyebrow, title, description, children }) {
  useEffect(() => {
    document.title = `${title} · AI Image Analyzer`;
  }, [title]);

  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {children ? <div className="page-heading-actions">{children}</div> : null}
    </div>
  );
}
