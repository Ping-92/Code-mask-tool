import { useState, useCallback } from "react";
import { MONO, maskCode, applyMapToCode, copyToClipboard } from "../maskerEngine";
import MapRow from "./MapRow";

const SAMPLE = `public class UserAccountDTO {
  private String firstName;
  private String emailAddress;
  private int userAge;

  public UserAccountDTO(String firstName, String emailAddress, int userAge) {
    this.firstName = firstName;
    this.emailAddress = emailAddress;
    this.userAge = userAge;
  }

  public String getFormattedName() {
    String displayName = firstName.trim();
    return displayName.toUpperCase();
  }

  public boolean isEligibleUser() {
    int minimumAge = 18;
    return userAge >= minimumAge && emailAddress != null;
  }
}`;

export default function MaskPanel({ onMapChange }) {
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [mapping, setMapping] = useState([]);
  const [options, setOptions] = useState({ maskMethods: true, maskVariables: true, maskClasses: true, prefix: "" });
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("split");
  const [mapErrors, setMapErrors] = useState({});

  const mappingToMap = (rows) => new Map(rows.map(r => [r.original, r.masked]));

  const reapply = useCallback((rows) => {
    const map = mappingToMap(rows);
    setOutput(applyMapToCode(input, map));
    onMapChange(map);
  }, [input, onMapChange]);

  const runMask = useCallback(() => {
    const { masked, map } = maskCode(input, options);
    setOutput(masked);
    setMapping([...map.entries()].map(([original, masked]) => ({ original, masked })));
    setMapErrors({});
    onMapChange(map);
  }, [input, options, onMapChange]);

  const handleMaskedChange = (idx, val) => {
    const trimmed = val.trim();
    const errors = { ...mapErrors };
    if (!trimmed) { errors[idx] = "Cannot be empty"; setMapErrors(errors); return; }
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) { errors[idx] = "Invalid identifier"; setMapErrors(errors); return; }
    if (mapping.some((r, i) => i !== idx && r.masked === trimmed)) { errors[idx] = "Already used"; setMapErrors(errors); return; }
    delete errors[idx]; setMapErrors(errors);
    const updated = mapping.map((r, i) => i === idx ? { ...r, masked: trimmed } : r);
    setMapping(updated); reapply(updated);
  };

  const handleOriginalChange = (idx, val) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const updated = mapping.map((r, i) => i === idx ? { ...r, original: trimmed } : r);
    setMapping(updated); reapply(updated);
  };

  const handleDelete = (idx) => {
    const updated = mapping.filter((_, i) => i !== idx);
    const errors = { ...mapErrors }; delete errors[idx]; setMapErrors(errors);
    setMapping(updated); reapply(updated);
  };

  const toggle = (key) => setOptions(o => ({ ...o, [key]: !o[key] }));

  const editorStyle = { flex: 1, background: "transparent", border: "none", outline: "none", color: "#cbd5e1", fontFamily: MONO, fontSize: 12, lineHeight: 1.7, padding: "16px 20px", resize: "none", whiteSpace: "pre" };
  const colHeader = { padding: "8px 16px", fontSize: 9, color: "#4a5568", letterSpacing: "0.15em", borderBottom: "1px solid #1a1a28", display: "flex", justifyContent: "space-between", alignItems: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #1e2030", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "#0c0c15" }}>
        {[{ key: "maskMethods", label: "Methods", color: "#7dd3fc" }, { key: "maskVariables", label: "Variables", color: "#86efac" }, { key: "maskClasses", label: "Classes / DTOs", color: "#f9a8d4" }].map(({ key, label, color }) => (
          <button key={key} onClick={() => toggle(key)} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${options[key] ? color : "#2a2a3a"}`, background: options[key] ? `${color}18` : "transparent", color: options[key] ? color : "#4a5568", fontSize: 11, fontFamily: MONO, cursor: "pointer", letterSpacing: "0.06em" }}>
            {options[key] ? "✓ " : ""}{label}
          </button>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.1em" }}>PREFIX</span>
          <input value={options.prefix} onChange={e => setOptions(o => ({ ...o, prefix: e.target.value }))} placeholder="e.g. masked_"
            style={{ background: "#111120", border: "1px solid #2a2a3a", borderRadius: 6, padding: "4px 10px", color: "#a78bfa", fontSize: 11, fontFamily: MONO, width: 120, outline: "none" }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["split", "output", "map"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tab === t ? "#6366f1" : "#1a1a28", color: tab === t ? "#fff" : "#64748b", fontSize: 10, fontFamily: MONO, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t}</button>
          ))}
        </div>
        <button onClick={runMask} style={{ padding: "7px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#6366f1,#a855f7)", color: "#fff", fontSize: 11, fontFamily: MONO, cursor: "pointer", fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 0 14px #6366f144" }}>▶ MASK</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {(tab === "split" || tab === "input") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid #1e2030" }}>
            <div style={colHeader}><span>INPUT</span></div>
            <textarea value={input} onChange={e => setInput(e.target.value)} spellCheck={false} style={editorStyle} />
          </div>
        )}
        {(tab === "split" || tab === "output") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid #1e2030" }}>
            <div style={colHeader}>
              <span>OUTPUT</span>
              {output && <button onClick={() => copyToClipboard(output, setCopied)} style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: copied ? "#86efac" : "#64748b", fontSize: 9, fontFamily: MONO, cursor: "pointer", padding: "2px 8px" }}>{copied ? "✓ COPIED" : "COPY"}</button>}
            </div>
            <pre style={{ flex: 1, margin: 0, padding: "16px 20px", color: output ? "#a5b4fc" : "#2a2a3a", fontFamily: MONO, fontSize: 12, lineHeight: 1.7, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {output || "← Paste code on the left, then click ▶ MASK"}
            </pre>
          </div>
        )}
        {tab === "map" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={colHeader}>
              <span style={{ color: "#6366f1" }}>IDENTIFIER MAP — click any name to edit</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setMapping(m => [...m, { original: "newName", masked: `alias_${m.length + 1}` }])}
                  style={{ background: "none", border: "1px solid #6366f1", borderRadius: 4, color: "#6366f1", fontSize: 9, fontFamily: MONO, cursor: "pointer", padding: "2px 10px" }}>+ ADD ROW</button>
                <button onClick={runMask} style={{ background: "none", border: "1px solid #2a2a3a", borderRadius: 4, color: "#64748b", fontSize: 9, fontFamily: MONO, cursor: "pointer", padding: "2px 10px" }}>↺ RESET</button>
              </div>
            </div>
            {mapping.length === 0
              ? <div style={{ color: "#2a2a3a", marginTop: 40, textAlign: "center", fontSize: 12 }}>Run ▶ MASK first to generate the map.</div>
              : <div style={{ overflow: "auto", flex: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead><tr>{["Type", "Original", "→", "Masked", ""].map((h, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "8px 10px", color: "#4a5568", borderBottom: "1px solid #1e2030", fontSize: 9 }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>
                      {mapping.map((row, i) => (
                        <MapRow key={i} row={row} prefix={options.prefix} error={mapErrors[i]}
                          onMaskedChange={val => handleMaskedChange(i, val)}
                          onOriginalChange={val => handleOriginalChange(i, val)}
                          onDelete={() => handleDelete(i)} />
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px", fontSize: 9, color: "#2a2a3a" }}>Edits instantly re-apply to output. ↺ RESET restores auto-generated names.</div>
                </div>}
          </div>
        )}
      </div>
    </div>
  );
}