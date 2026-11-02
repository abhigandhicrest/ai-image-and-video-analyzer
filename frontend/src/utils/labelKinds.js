// Groups DetectLabels results into animal, vehicle, object, or other.
// The token lists mirror the same rules on the Python API.

const ANIMAL_TOKENS = new Set([
  "animal",
  "mammal",
  "bird",
  "fish",
  "reptile",
  "amphibian",
  "insect",
  "pet",
  "wildlife",
  "invertebrate",
  "sea life",
  "arachnid",
]);

const VEHICLE_TOKENS = new Set([
  "vehicle",
  "car",
  "truck",
  "bus",
  "motorcycle",
  "bicycle",
  "bike",
  "aircraft",
  "airplane",
  "boat",
  "ship",
  "train",
  "transportation",
  "suv",
  "van",
  "scooter",
]);

const OTHER_TOKENS = new Set(["person", "people", "human", "crowd", "text", "symbol"]);

const OTHER_HINTS = [
  "person",
  "color",
  "visual composition",
  "text",
  "document",
  "symbol",
  "flag",
  "building",
  "architecture",
  "nature",
  "outdoor",
  "plant",
  "flower",
];

const OBJECT_HINTS = [
  "object",
  "apparel",
  "kitchen",
  "food",
  "beverage",
  "technology",
  "computing",
  "weapon",
  "sport",
  "tool",
  "furniture",
  "home",
  "musical",
  "beauty",
  "medical",
];

export const KIND_LABELS = {
  animal: "Animal",
  vehicle: "Vehicle",
  object: "Object",
  other: "Other",
};

export function classifyLabel(label) {
  // Trust the kind the API already stored when it is one of the four groups.
  if (label?.kind && KIND_LABELS[label.kind]) {
    return label.kind;
  }
  const categories = label?.categories || [];
  const categoryText = categories.join(" ").toLowerCase();
  const tokens = new Set([String(label?.name || "").toLowerCase(), ...(label?.parents || []).map((parent) => parent.toLowerCase())]);

  if (categoryText.includes("animal") || categoryText.includes("pet") || [...tokens].some((token) => ANIMAL_TOKENS.has(token))) {
    return "animal";
  }
  if (
    categoryText.includes("vehicle") ||
    categoryText.includes("automotive") ||
    categoryText.includes("transport") ||
    [...tokens].some((token) => VEHICLE_TOKENS.has(token))
  ) {
    return "vehicle";
  }
  if ([...tokens].some((token) => OTHER_TOKENS.has(token)) || OTHER_HINTS.some((hint) => categoryText.includes(hint))) {
    return "other";
  }
  if (OBJECT_HINTS.some((hint) => categoryText.includes(hint))) {
    return "object";
  }
  // A box means Rekognition located a thing, so treat it as an object.
  if ((label?.instance_count || 0) > 0) {
    return "object";
  }
  return "other";
}

export function groupLabels(labels) {
  const groups = { animal: [], vehicle: [], object: [], other: [] };
  (labels || []).forEach((label) => {
    groups[classifyLabel(label)].push(label);
  });
  return groups;
}
