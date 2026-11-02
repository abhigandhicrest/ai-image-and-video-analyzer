// Shown for any path that is not one of the app routes.
import { Link } from "react-router-dom";

import PageHeader from "../components/PageHeader";

export default function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader eyebrow="404" title="Page not found" description="That address is not part of the analyzer.">
        <Link className="btn btn-accent" to="/">
          Back to dashboard
        </Link>
      </PageHeader>
    </div>
  );
}
