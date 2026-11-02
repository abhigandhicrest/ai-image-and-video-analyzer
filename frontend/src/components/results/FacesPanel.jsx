// One card per detected face: age, attributes, pose, emotions, and landmarks.
import ConfidenceBar from "../ConfidenceBar";
import { formatAttribute, formatBox, formatConfidence, scoreTone } from "../../utils/format";

const ATTRIBUTES = [
  ["Smile", "smile"],
  ["Eyeglasses", "eyeglasses"],
  ["Sunglasses", "sunglasses"],
  ["Beard", "beard"],
  ["Mustache", "mustache"],
  ["Eyes open", "eyes_open"],
  ["Mouth open", "mouth_open"],
];

export default function FacesPanel({ data }) {
  const faces = data?.faces || [];

  return (
    <section className="section-card">
      <header className="section-heading">
        <div>
          <h2>Face detection</h2>
          <p>
            {data?.face_count || 0} {data?.face_count === 1 ? "face" : "faces"} returned by DetectFaces.
          </p>
        </div>
      </header>
      {faces.length === 0 ? (
        <p className="section-empty">No faces were detected.</p>
      ) : (
        <div className="face-grid">
          {faces.map((face, index) => {
            const topEmotion = face.emotions?.[0];
            return (
              <article className="face-card" key={`face-${index}`}>
                <header>
                  <h3>Face {index + 1}</h3>
                  <ConfidenceBar value={face.confidence} tone={scoreTone(face.confidence)} />
                </header>
                <dl className="attribute-list">
                  <div>
                    <dt>Age range</dt>
                    <dd>
                      {face.age_range?.low != null && face.age_range?.high != null
                        ? `${face.age_range.low}–${face.age_range.high}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Gender</dt>
                    <dd>
                      {formatAttribute(face.gender)}
                      <small>Estimated by Rekognition</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Primary emotion</dt>
                    <dd>{topEmotion ? `${topEmotion.type} · ${formatConfidence(topEmotion.confidence)}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Bounding box</dt>
                    <dd className="mono">{formatBox(face.bounding_box)}</dd>
                  </div>
                  <div>
                    <dt>Pose</dt>
                    <dd>
                      Roll {face.pose?.roll ?? "—"} · Yaw {face.pose?.yaw ?? "—"} · Pitch {face.pose?.pitch ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Quality</dt>
                    <dd>
                      Brightness {face.quality?.brightness ?? "—"} · Sharpness {face.quality?.sharpness ?? "—"}
                    </dd>
                  </div>
                </dl>
                <ul className="attribute-pills">
                  {ATTRIBUTES.map(([label, key]) => (
                    <li key={key}>
                      <span>{label}</span>
                      <strong>{formatAttribute(face[key])}</strong>
                    </li>
                  ))}
                </ul>
                {face.emotions?.length ? (
                  <details>
                    <summary>All emotions</summary>
                    <ul className="plain-list">
                      {face.emotions.map((emotion) => (
                        <li key={emotion.type}>
                          {emotion.type} · {formatConfidence(emotion.confidence)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {face.landmarks?.length ? (
                  <details>
                    <summary>{face.landmarks.length} landmarks</summary>
                    <div className="table-wrap">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th scope="col">Point</th>
                            <th scope="col">X</th>
                            <th scope="col">Y</th>
                          </tr>
                        </thead>
                        <tbody>
                          {face.landmarks.map((landmark, landmarkIndex) => (
                            <tr key={`${landmark.type}-${landmarkIndex}`}>
                              <td>{landmark.type}</td>
                              <td>{landmark.x}</td>
                              <td>{landmark.y}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
