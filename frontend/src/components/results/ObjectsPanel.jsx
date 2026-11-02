// Filterable table of DetectLabels results, grouped as animal, vehicle, object, or other.
import { useMemo, useState } from "react";

import ConfidenceBar from "../ConfidenceBar";
import { KIND_LABELS, classifyLabel, groupLabels } from "../../utils/labelKinds";
import { formatBox, scoreTone } from "../../utils/format";

const FILTERS = [
  ["all", "All"],
  ["animal", "Animals"],
  ["vehicle", "Vehicles"],
  ["object", "Objects"],
  ["other", "Other items"],
];

export default function ObjectsPanel({ data }) {
  const labels = data?.labels || [];
  const [kind, setKind] = useState("all");
  const grouped = useMemo(() => groupLabels(labels), [labels]);
  const visible = kind === "all" ? labels : grouped[kind];

  return (
    <section className="section-card">
      <header className="section-heading">
        <div>
          <h2>Detected items</h2>
          <p>Animals, vehicles, objects, and other items from DetectLabels.</p>
        </div>
      </header>
      {labels.length === 0 ? (
        <p className="section-empty">No items met the minimum confidence.</p>
      ) : (
        <>
          <div className="filter-group" role="group" aria-label="Filter detected items">
            {FILTERS.map(([value, label]) => {
              const count = value === "all" ? labels.length : grouped[value].length;
              return (
                <button key={value} type="button" className={kind === value ? "is-active" : ""} onClick={() => setKind(value)}>
                  {label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
          {visible.length === 0 ? (
            <p className="section-empty">Nothing in this group was detected.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Group</th>
                    <th scope="col">Category</th>
                    <th scope="col">Detections</th>
                    <th scope="col">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((label) => {
                    const itemKind = classifyLabel(label);
                    return (
                      <tr key={`${itemKind}-${label.name}-${label.confidence}`}>
                        <td>
                          <strong>{label.name}</strong>
                          {label.parents?.length ? <small>{label.parents.join(", ")}</small> : null}
                          {label.instances?.some((instance) => instance.bounding_box) ? (
                            <small className="location-line">
                              {label.instances
                                .filter((instance) => instance.bounding_box)
                                .map((instance) => formatBox(instance.bounding_box))
                                .join(" · ")}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <span className={`kind-badge tone-${itemKind}`}>{KIND_LABELS[itemKind]}</span>
                        </td>
                        <td>{label.categories?.length ? label.categories.join(", ") : "—"}</td>
                        <td>{label.instance_count > 0 ? label.instance_count : "—"}</td>
                        <td>
                          <ConfidenceBar value={label.confidence} tone={scoreTone(label.confidence)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
