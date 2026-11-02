// Browser settings for thresholds and the API URL, plus a read-only server status card.
import { useEffect, useState } from "react";

import AlertBanner from "../components/AlertBanner";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../context/SettingsContext";
import { getErrorMessage, getHealth } from "../services/api";
import { isValidApiBaseUrl } from "../services/settings";

export default function SettingsPage() {
  const { settings, defaults, updateSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    let active = true;
    getHealth()
      .then((data) => {
        if (active) {
          setHealth(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setHealthError(getErrorMessage(requestError));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function updateField(key, value) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event) {
    event.preventDefault();
    const review = Number(form.reviewThreshold);
    const restricted = Number(form.restrictedThreshold);
    const labels = Number(form.labelMinConfidence);
    const apiBaseUrl = String(form.apiBaseUrl || "").trim();

    if ([review, restricted, labels].some((value) => Number.isNaN(value) || value < 0 || value > 100)) {
      setError("Thresholds must be numbers from 0 to 100.");
      setSaved(false);
      return;
    }
    // Keep the same rule the API enforces: review cannot sit above restricted.
    if (review > restricted) {
      setError("The review threshold cannot be higher than the restricted threshold.");
      setSaved(false);
      return;
    }
    if (!isValidApiBaseUrl(apiBaseUrl)) {
      setError("The API URL must start with http:// or https://, or be left blank.");
      setSaved(false);
      return;
    }

    updateSettings({
      apiBaseUrl,
      reviewThreshold: review,
      restrictedThreshold: restricted,
      labelMinConfidence: labels,
    });
    setError("");
    setSaved(true);
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Thresholds are saved in this browser and sent with each analysis. AWS keys are configured only on the server."
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {saved ? <AlertBanner tone="success">Settings saved in this browser.</AlertBanner> : null}

      <div className="settings-grid">
        <form className="section-card settings-form" onSubmit={onSubmit}>
          <h2>Analysis thresholds</h2>
          <label>
            Review threshold (%)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.reviewThreshold}
              onChange={(event) => updateField("reviewThreshold", event.target.value)}
            />
            <small>Moderation labels at or above this score are marked Review Required.</small>
          </label>
          <label>
            Restricted threshold (%)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.restrictedThreshold}
              onChange={(event) => updateField("restrictedThreshold", event.target.value)}
            />
            <small>Labels at or above this score are marked Restricted.</small>
          </label>
          <label>
            Minimum object confidence (%)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.labelMinConfidence}
              onChange={(event) => updateField("labelMinConfidence", event.target.value)}
            />
            <small>DetectLabels ignores objects below this confidence.</small>
          </label>
          <label>
            API base URL
            <input
              type="url"
              inputMode="url"
              placeholder="Blank uses the local Vite proxy"
              value={form.apiBaseUrl}
              onChange={(event) => updateField("apiBaseUrl", event.target.value)}
            />
            <small>Leave this blank while the frontend dev server proxies /api.</small>
          </label>
          <div className="upload-actions">
            <button type="submit" className="btn btn-accent">
              Save settings
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                const restored = updateSettings(defaults);
                setForm(restored);
                setError("");
                setSaved(true);
              }}
            >
              Reset defaults
            </button>
          </div>
        </form>

        <aside className="section-card server-card">
          <h2>Server</h2>
          {healthError ? <AlertBanner tone="danger">{healthError}</AlertBanner> : null}
          {health ? (
            <dl className="attribute-list">
              <div>
                <dt>API</dt>
                <dd>{health.api === "ok" ? "Online" : health.status}</dd>
              </div>
              <div>
                <dt>MongoDB</dt>
                <dd>{health.mongo === "connected" ? "Connected" : "Unavailable"}</dd>
              </div>
              <div>
                <dt>AWS region</dt>
                <dd>{health.aws_region}</dd>
              </div>
              <div>
                <dt>AWS credentials</dt>
                <dd>
                  {health.aws_credentials_configured
                    ? "Present in backend/.env"
                    : "Not set in backend/.env. The server still uses the AWS credential chain when one is available."}
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="section-empty">
            Put AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in backend/.env. Restart the API after changing them.
          </p>
        </aside>
      </div>
    </div>
  );
}
