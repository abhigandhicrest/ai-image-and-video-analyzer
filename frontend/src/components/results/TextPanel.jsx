// Extracted lines, a copy button, and a collapsed word-level table.
import { useState } from "react";
import { FiCopy } from "react-icons/fi";

import ConfidenceBar from "../ConfidenceBar";
import { formatBox, formatConfidence, scoreTone } from "../../utils/format";

export default function TextPanel({ data }) {
  const lines = data?.lines || [];
  const words = data?.words || [];
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(data?.full_text || "");
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("The browser blocked clipboard access.");
    }
  }

  return (
    <section className="section-card">
      <header className="section-heading">
        <div>
          <h2>Text detection</h2>
          <p>
            {data?.line_count || 0} lines and {data?.word_count || 0} words returned by DetectText.
          </p>
        </div>
        {data?.full_text ? (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={copyText}>
            <FiCopy aria-hidden="true" /> {copied ? "Copied" : "Copy text"}
          </button>
        ) : null}
      </header>
      {copyError ? <p className="section-empty">{copyError}</p> : null}
      {!lines.length ? (
        <p className="section-empty">No text was detected.</p>
      ) : (
        <>
          <pre className="extracted-text">{data.full_text}</pre>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Location</th>
                  <th scope="col">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.id ?? index}-${line.text}`}>
                    <td>{line.text}</td>
                    <td className="mono">{formatBox(line.bounding_box)}</td>
                    <td>
                      <ConfidenceBar value={line.confidence} tone={scoreTone(line.confidence)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {words.length ? (
            <details>
              <summary>Word-level detections ({words.length})</summary>
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th scope="col">Word</th>
                      <th scope="col">Location</th>
                      <th scope="col">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {words.map((word, index) => (
                      <tr key={`${word.id ?? index}-${word.text}`}>
                        <td>{word.text}</td>
                        <td className="mono">{formatBox(word.bounding_box)}</td>
                        <td>{formatConfidence(word.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
