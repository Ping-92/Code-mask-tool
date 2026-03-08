import { useState } from "react";
import { MONO, TYPE_COLOR, TYPE_LABEL, getType } from "../maskerEngine";

// editable table map

export default function MapRow({ row, prefix, onMaskedChange, onOriginalChange, onDelete, error }) {
  const t = getType(row.masked, prefix);
  const [editingOrig, setEditingOrig] = useState(false);
  const [editingMasked, setEditingMasked] = useState(false);
  const inputBase = { background: "#111120", borderRadius: 4, color: "#e2e8f0", fontFamily: MONO, fontSize: 11, padding: "2px 8px", outline: "none", width: 160 };

  return (
    <tr style={{ borderBottom: "1px solid #12121e" }}>
      <td style={{ padding: "6px 10px" }}>
        <span style={{ background: `${TYPE_COLOR[t]}18`, color: TYPE_COLOR[t], border: `1px solid ${TYPE_COLOR[t]}44`, borderRadius: 4, padding: "1px 7px", fontSize: 9, letterSpacing: "0.1em" }}>{TYPE_LABEL[t]}</span>
      </td>
      <td style={{ padding: "6px 10px" }}>
        {editingOrig
          ? <input autoFocus defaultValue={row.original} style={{ ...inputBase, border: "1px solid #6366f1" }}
              onBlur={e => { onOriginalChange(e.target.value); setEditingOrig(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingOrig(false); }} />
          : <span onClick={() => setEditingOrig(true)} style={{ color: "#94a3b8", cursor: "text", borderBottom: "1px dashed #2a2a3a", paddingBottom: 1 }}>{row.original}</span>}
      </td>
      <td style={{ padding: "6px 10px", color: "#2a2a3a" }}>→</td>
      <td style={{ padding: "6px 10px" }}>
        {editingMasked
          ? <input autoFocus defaultValue={row.masked} style={{ ...inputBase, border: `1px solid ${TYPE_COLOR[t]}`, color: TYPE_COLOR[t] }}
              onBlur={e => { onMaskedChange(e.target.value); setEditingMasked(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingMasked(false); }} />
          : <span onClick={() => setEditingMasked(true)} style={{ color: TYPE_COLOR[t], cursor: "text", borderBottom: `1px dashed ${TYPE_COLOR[t]}66`, paddingBottom: 1 }}>{row.masked}</span>}
        {error && <span style={{ marginLeft: 8, color: "#f87171", fontSize: 9 }}>{error}</span>}
      </td>
      <td style={{ padding: "6px 6px" }}>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#2a2a3a", cursor: "pointer", fontSize: 13, padding: "0 4px" }}
          onMouseEnter={e => e.target.style.color = "#f87171"} onMouseLeave={e => e.target.style.color = "#2a2a3a"}>✕</button>
      </td>
    </tr>
  );
}