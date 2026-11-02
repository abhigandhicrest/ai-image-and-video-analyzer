// Display helpers shared by tables, badges, and confidence bars.

export const STATUS_LABELS = {
  safe: "Safe",
  review: "Review Required",
  restricted: "Restricted",
};

export const TYPE_LABELS = {
  full: "Full analysis",
  labels: "Objects",
  faces: "Faces",
  text: "Text",
  moderation: "Moderation",
  video: "Video",
};

export function formatTimestamp(ms) {
  // Show a clip position as m:ss.s. Missing values stay at the start of the clip.
  const rounded = Math.round((Math.max(0, Number(ms) || 0) / 1000) * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const seconds = (rounded - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

export function formatConfidence(value) {
  // Missing scores stay as an em dash instead of "NaN%".
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(1)}%`;
}

export function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatBox(box) {
  // Rekognition boxes are fractions. Show them as percentages of the image.
  if (!box) {
    return "—";
  }
  const pct = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
  return `L ${pct(box.left)} · T ${pct(box.top)} · W ${pct(box.width)} · H ${pct(box.height)}`;
}

export function formatAttribute(attribute) {
  if (!attribute || attribute.value === null || attribute.value === undefined) {
    return "—";
  }
  const label = typeof attribute.value === "boolean" ? (attribute.value ? "Yes" : "No") : attribute.value;
  return `${label} · ${formatConfidence(attribute.confidence)}`;
}

export function scoreTone(value) {
  // Color a confidence bar: high scores read as good, low scores as weak.
  const amount = Number(value) || 0;
  if (amount >= 90) {
    return "good";
  }
  if (amount >= 70) {
    return "mid";
  }
  return "low";
}

export function riskTone(value) {
  // Color a moderation bar: higher confidence means more risk.
  const amount = Number(value) || 0;
  if (amount >= 80) {
    return "danger";
  }
  if (amount >= 50) {
    return "warning";
  }
  return "neutral";
}
