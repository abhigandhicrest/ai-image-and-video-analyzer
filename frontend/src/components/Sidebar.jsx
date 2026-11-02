// Primary navigation. onNavigate closes the mobile drawer after a link is chosen.
import { NavLink } from "react-router-dom";
import { FiAperture, FiClock, FiGrid, FiSettings, FiUploadCloud, FiVideo, FiX } from "react-icons/fi";

const LINKS = [
  { to: "/", label: "Dashboard", icon: FiGrid, end: true },
  { to: "/analyze", label: "Analyze", icon: FiUploadCloud, end: true },
  { to: "/analyze/video", label: "Analyze video", icon: FiVideo, end: true },
  { to: "/history", label: "History", icon: FiClock },
  { to: "/settings", label: "Settings", icon: FiSettings },
];

export default function Sidebar({ open, onNavigate }) {
  return (
    <aside className={`app-sidebar${open ? " is-open" : ""}`}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <FiAperture />
        </span>
        <div>
          <strong className="brand-name">Image Analyzer</strong>
          <small>AWS Rekognition</small>
        </div>
        <button type="button" className="sidebar-close d-lg-none" aria-label="Close menu" hidden={!open} onClick={onNavigate}>
          <FiX />
        </button>
      </div>

      <p className="nav-label">Workspace</p>
      <nav className="side-nav" aria-label="Primary">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
              onClick={onNavigate}
            >
              <Icon aria-hidden="true" />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <p className="sidebar-note">AWS credentials stay on the server. Uploaded images and videos are not stored in the database.</p>
    </aside>
  );
}
