// Turn selected result boxes into preview rectangles. Coordinates stay as fractions.

export function buildOverlays(results, options) {
  if (!results) {
    return [];
  }
  const overlays = [];
  if (options.faces) {
    (results.faces?.faces || []).forEach((face, index) => {
      if (!face.bounding_box) {
        return;
      }
      overlays.push({
        id: `face-${index}`,
        box: face.bounding_box,
        label: `Face ${index + 1}`,
        tone: "face",
      });
    });
  }
  if (options.objects) {
    (results.labels?.labels || []).forEach((label, labelIndex) => {
      (label.instances || []).forEach((instance, index) => {
        if (!instance.bounding_box) {
          return;
        }
        overlays.push({
          id: `object-${labelIndex}-${index}`,
          box: instance.bounding_box,
          label: label.name,
          tone: "object",
        });
      });
    });
  }
  if (options.text) {
    (results.text?.lines || []).forEach((line, index) => {
      if (!line.bounding_box) {
        return;
      }
      overlays.push({
        id: `text-${index}`,
        box: line.bounding_box,
        label: line.text,
        tone: "text",
      });
    });
  }
  return overlays;
}
