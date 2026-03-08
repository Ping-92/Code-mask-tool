import { useState } from "react";
import { MONO, unmaskCode, copyToClipboard } from "../maskerEngine";

export default function UnmaskPanel({ savedMap }) {
  const [unmaskInput, setUnmaskInput] = useState("");
  const [unmaskOutput, setUnmaskOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const hasMap = savedMap && savedMap.size > 0;

  const runUnmask = () => {
    if (!hasMap) { alert("No mapping available. Switch to MASK tab and run ▶ MASK first."); return; }
    setUnmaskOutput(unmaskCode(unmaskInput, savedMap));
  };

  const editorStyle = {
    flex: 1,
    minHeight: 0,
    background: "transparent",
    border: "none",
    outline: "none",
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.7,
    padding: "16px 20px",
    resize: "none",
    whiteSpace: "pre",
    overflowY: "auto",
  };

  const colHeader = {
    padding: "8px 16px",
    fontSize: 9,
    color: "#4a5568",
    letterSpacing: "0.15em",
    borderBottom: "1px solid #1a1a28",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Top bar */}
      <div style={{ padding: "10px 24px", background: hasMap ? "#0d1f0d" : "#1a1208", borderBottom: "1px solid #1e2030", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: hasMap ? "#86efac" : "#f59e0b", letterSpacing: "0.1em" }}>
          {hasMap ? `✓ MAP LOADED — ${savedMap.size} identifiers ready to restore` : "⚠ NO MAP — Switch to MASK tab and run ▶ MASK first"}
        </span>
        <button onClick={runUnmask} style={{ padding: "6px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#a855f7,#6366f1)", color: "#fff", fontSize: 11, fontFamily: MONO, cursor: "pointer", fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 0 12px #a855f744" }}>
          ↩ UNMASK
        </button>
      </div>

      {/* Columns */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Left — masked input */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid #1e2030" }}>
          <div style={colHeader}>
            <span>MASKED CODE (INPUT)</span>
          </div>
          <textarea
            value={unmaskInput}
            onChange={e => setUnmaskInput(e.target.value)}
            spellCheck={false}
            placeholder="Paste masked code here..."
            style={{ ...editorStyle, color: "#a5b4fc" }}
          />
        </div>

        {/* Right — original output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={colHeader}>
            <span>ORIGINAL CODE (OUTPUT)</span>
            {unmaskOutput && (
              <button onClick={() => copyToClipboard(unmaskOutput, setCopied)} style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: copied ? "#86efac" : "#64748b", fontSize: 9, fontFamily: MONO, cursor: "pointer", padding: "2px 8px" }}>
                {copied ? "✓ COPIED" : "COPY"}
              </button>
            )}
          </div>
          <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: "16px 20px", color: unmaskOutput ? "#cbd5e1" : "#2a2a3a", fontFamily: MONO, fontSize: 12, lineHeight: 1.7, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {unmaskOutput || "← Paste masked code on the left, then click ↩ UNMASK"}
          </pre>
        </div>

      </div>
    </div>
  );
}