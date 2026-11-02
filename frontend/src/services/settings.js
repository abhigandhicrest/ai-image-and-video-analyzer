// Browser-only analysis settings. AWS keys are never stored here.
const STORAGE_KEY = "ai-image-analyzer-settings";

export const defaultSettings = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  reviewThreshold: 50,
  restrictedThreshold: 80,
  labelMinConfidence: 50,
};

export function loadSettings() {
  // Corrupt or missing storage falls back to defaults so the app can still start.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      reviewThreshold: Number(parsed.reviewThreshold ?? defaultSettings.reviewThreshold),
      restrictedThreshold: Number(parsed.restrictedThreshold ?? defaultSettings.restrictedThreshold),
      labelMinConfidence: Number(parsed.labelMinConfidence ?? defaultSettings.labelMinConfidence),
      apiBaseUrl: typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : defaultSettings.apiBaseUrl,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  // Strip a trailing slash so request paths do not become /api/api.
  const next = {
    ...defaultSettings,
    ...settings,
    apiBaseUrl: String(settings.apiBaseUrl || "").replace(/\/+$/, ""),
    reviewThreshold: Number(settings.reviewThreshold),
    restrictedThreshold: Number(settings.restrictedThreshold),
    labelMinConfidence: Number(settings.labelMinConfidence),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isValidApiBaseUrl(value) {
  // A blank URL is valid: requests stay relative and use the dev proxy.
  if (!value) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
