import { useState } from "react";
import { MONO } from "../maskerEngine";
import MaskPanel from "./MaskPanel";
import UnmaskPanel from "./UnmaskPanel";

export default function CodeMasker() {
  const [mode, setMode] = useState("mask");
  const [savedMap, setSavedMap] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: MONO, display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: "1px solid #1e2030", padding: "16px 28px", display: "flex", alignItems: "center", gap: 16, background: "linear-gradient(90deg,#0d0d18,#0a0a0f)", flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⬛</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "#c4b5fd" }}>CODE MASKER</div>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.12em" }}>ANONYMIZE · RESTORE · EDIT MAP · METHODS · VARIABLES · DTOs</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", background: "#111120", borderRadius: 8, padding: 3, border: "1px solid #1e2030" }}>
          {[["mask", "⬛ MASK"], ["unmask", "↩ UNMASK"]].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: "6px 20px", borderRadius: 6, border: "none", background: mode === m ? "linear-gradient(135deg,#6366f1,#a855f7)" : "transparent", color: mode === m ? "#fff" : "#4a5568", fontSize: 10, fontFamily: MONO, cursor: "pointer", fontWeight: mode === m ? 700 : 400, letterSpacing: "0.1em" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, display: mode === "mask" ? "flex" : "none", flexDirection: "column", minHeight: 0 }}>
          <MaskPanel onMapChange={setSavedMap} />
        </div>
        <div style={{ flex: 1, display: mode === "unmask" ? "flex" : "none", flexDirection: "column", minHeight: 0 }}>
          <UnmaskPanel savedMap={savedMap} />
        </div>
      </div>
    </div>
  );
}