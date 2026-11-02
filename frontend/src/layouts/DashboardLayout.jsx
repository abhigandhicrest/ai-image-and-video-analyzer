// Shell around every page: sidebar, mobile menu, health pill, and the routed content.
import { useEffect, useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import { Outlet } from "react-router-dom";

import HealthPill from "../components/HealthPill";
import Sidebar from "../components/Sidebar";
import { getHealth } from "../services/api";

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getHealth()
      .then((data) => {
        if (active) {
          setHealth(data);
        }
      })
      .catch(() => {
        if (active) {
          setHealth(null);
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

  useEffect(() => {
    // nav-open locks background scroll while the mobile drawer is visible.
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  return (
    <div className="app-shell">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open ? <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <div className="app-content">
        <header className="app-topbar">
          <button
            type="button"
            className="menu-button d-lg-none"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <FiX /> : <FiMenu />}
          </button>
          <p className="topbar-title d-lg-none">Image Analyzer</p>
          <HealthPill health={health} loading={loading} />
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
