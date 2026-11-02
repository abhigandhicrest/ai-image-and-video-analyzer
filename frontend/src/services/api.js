// HTTP client for the FastAPI backend. Image bytes go out as multipart form data.
import axios from "axios";

import { loadSettings } from "./settings";

// Two minutes covers a full Rekognition pass on a larger image.
export const api = axios.create({
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  // A blank base URL keeps requests relative so the Vite proxy can forward /api.
  const { apiBaseUrl } = loadSettings();
  config.baseURL = apiBaseUrl || "";
  return config;
});

export function getErrorMessage(error) {
  // Prefer the API's own message. Fall back to a connection hint when there is no response.
  if (error?.code === "ECONNABORTED") {
    return "The request timed out before Rekognition finished. Try a shorter video or a smaller image.";
  }

  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
    return detail.message;
  }
  if (Array.isArray(detail)) {
    const text = detail.map((item) => item?.msg).filter(Boolean).join(" ");
    if (text) {
      return text;
    }
  }
  if (!error?.response) {
    return "Cannot reach the API. Start the backend and confirm the API URL in Settings.";
  }
  return "The server could not complete this request.";
}

function imageRequest(path, file, params) {
  // The field name must stay "file" to match the FastAPI UploadFile parameter.
  const form = new FormData();
  form.append("file", file);
  return api.post(path, form, { params }).then((response) => response.data);
}

export function getHealth() {
  return api.get("/api/health").then((response) => response.data);
}

export function getStats() {
  return api.get("/api/stats").then((response) => response.data);
}

export function getHistory({ limit = 10, skip = 0, analysisType = "", filename = "" } = {}) {
  return api
    .get("/api/history", {
      params: {
        limit,
        skip,
        // Omit empty filters so the API does not treat them as a search.
        analysis_type: analysisType || undefined,
        filename: filename || undefined,
      },
    })
    .then((response) => response.data);
}

export function getHistoryItem(id) {
  return api.get(`/api/history/${id}`).then((response) => response.data);
}

export function deleteHistoryItem(id) {
  return api.delete(`/api/history/${id}`);
}

export function analyzeVideo(file, settings) {
  // Six frames each run four Rekognition calls, so this wait is longer than an image analysis.
  const form = new FormData();
  form.append("file", file);
  return api
    .post("/api/analyze/video", form, {
      params: {
        min_confidence: settings.labelMinConfidence,
        review_threshold: settings.reviewThreshold,
        restricted_threshold: settings.restrictedThreshold,
      },
      timeout: 240000,
    })
    .then((response) => response.data);
}

export function analyzeImage(file, settings) {
  // Full analysis: labels, faces, text, and moderation in one request.
  return imageRequest("/api/analyze", file, {
    min_confidence: settings.labelMinConfidence,
    review_threshold: settings.reviewThreshold,
    restricted_threshold: settings.restrictedThreshold,
  });
}

export function analyzeLabels(file, minConfidence) {
  return imageRequest("/api/analyze/labels", file, { min_confidence: minConfidence });
}

export function analyzeFaces(file) {
  return imageRequest("/api/analyze/faces", file);
}

export function analyzeText(file) {
  return imageRequest("/api/analyze/text", file);
}

export function analyzeModeration(file, settings) {
  return imageRequest("/api/analyze/moderation", file, {
    review_threshold: settings.reviewThreshold,
    restricted_threshold: settings.restrictedThreshold,
  });
}
