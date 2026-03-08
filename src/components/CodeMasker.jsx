import { useState, useCallback } from "react";

// ─── Masking Engine (fixed) ──────────────────────────────────────────────────

function maskCode(code, options) {
  const { maskMethods, maskVariables, maskClasses, prefix } = options;
  const nameToMasked = new Map(); // original name → masked name
  const counters = { method: 0, var: 0, class: 0 };

  const assign = (name, type) => {
    if (!nameToMasked.has(name)) {
      counters[type]++;
      const label = type === "class" ? "Class" : type;
      nameToMasked.set(name, `${prefix}${label}_${counters[type]}`);
    }
    return nameToMasked.get(name);
  };

  // Build skip ranges for strings and comments (don't mask inside these)
  const buildSkipRanges = (src) => {
    const ranges = [];
    const patterns = [
      /\/\/[^\n]*/g,
      /\/\*[\s\S]*?\*\//g,
      /"(?:[^"\\]|\\.)*"/g,
      /'(?:[^'\\]|\\.)*'/g,
      /`(?:[^`\\]|\\.)*`/g,
    ];
    for (const p of patterns) {
      for (const m of src.matchAll(p)) {
        ranges.push([m.index, m.index + m[0].length]);
      }
    }
    return ranges;
  };

  const skipRanges = buildSkipRanges(code);
  const inSkip = (idx) => skipRanges.some(([s, e]) => idx >= s && idx < e);

  // RESERVED words — never mask these
  const RESERVED = new Set([
    "if","else","for","while","do","switch","case","break","continue","return",
    "new","this","super","null","true","false","void","class","interface","enum",
    "extends","implements","import","package","public","private","protected",
    "static","final","abstract","synchronized","try","catch","finally","throw",
    "throws","instanceof","int","long","double","float","boolean","char","byte",
    "short","String","var","let","const","function","async","await","typeof",
    "undefined","in","of","from","export","default","type","struct","record",
    "override","sealed","partial","virtual","readonly","get","set","string","bool",
    "object","List","Map","Set","Optional","void","auto","val","def","self","cls",
    "None","pass","lambda","yield","with","as","and","or","not","is","elif",
    "print","len","range","True","False",
  ]);

  // Step 1: collect class/DTO names FIRST
  const classNames = new Set();
  if (maskClasses) {
    // class Foo / interface Foo / enum Foo
    const classDefPattern = /\b(?:class|interface|enum|struct|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    for (const m of code.matchAll(classDefPattern)) {
      if (!inSkip(m.index) && !RESERVED.has(m[1])) {
        classNames.add(m[1]);
        assign(m[1], "class");
      }
    }
    // Names ending in DTO, Dto, Request, Response, Model, Entity, Vo, Bo
    const dtoPattern = /\b([A-Z][A-Za-z0-9_]*(?:DTO|Dto|Request|Response|Model|Entity|Vo|Bo))\b/g;
    for (const m of code.matchAll(dtoPattern)) {
      if (!inSkip(m.index) && !RESERVED.has(m[1])) {
        classNames.add(m[1]);
        assign(m[1], "class");
      }
    }
  }

  // Step 2: collect method names
  // Methods: identifier immediately followed by ( that isn't a reserved word or class name
  // Also handle: public/private/etc ReturnType methodName(
  const methodNames = new Set();
  if (maskMethods) {
    // Match: [modifiers] [returnType] methodName(
    // Key: methodName is preceded by a word boundary and followed by optional whitespace + (
    const methodPattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    for (const m of code.matchAll(methodPattern)) {
      const name = m[1];
      if (inSkip(m.index)) continue;
      if (RESERVED.has(name)) continue;
      if (classNames.has(name)) continue; // constructor — skip, already masked as class
      // Check if it looks like a method definition (has access modifier or return type before it)
      const before = code.slice(Math.max(0, m.index - 80), m.index);
      const isDefinition = /(?:public|private|protected|static|async|override|virtual|abstract|def\s)\s*(?:[\w<>\[\]?,\s]+\s+)?$/.test(before)
        || /\bfunction\s+$/.test(before)
        || /\bdef\s+$/.test(before);
      if (isDefinition) {
        methodNames.add(name);
        assign(name, "method");
      }
    }
  }

  // Step 3: collect variable names
  const varNames = new Set();
  if (maskVariables) {
    // Typed declarations: int foo, String foo, var foo, let foo, const foo, val foo
    const varPattern = /\b(?:var|let|const|val|int|long|double|float|boolean|bool|char|byte|short|auto|String|string|object)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    for (const m of code.matchAll(varPattern)) {
      const name = m[1];
      if (inSkip(m.index)) continue;
      if (RESERVED.has(name)) continue;
      if (classNames.has(name) || methodNames.has(name)) continue;
      varNames.add(name);
      assign(name, "var");
    }

    // Also catch: generic typed declarations like List<X> foo, Map<K,V> foo
    const genericVarPattern = /\b[A-Z][A-Za-z0-9_$]*(?:<[^>]+>)?\s+([a-z][A-Za-z0-9_$]*)\s*[=;,)]/g;
    for (const m of code.matchAll(genericVarPattern)) {
      const name = m[1];
      if (inSkip(m.index)) continue;
      if (RESERVED.has(name)) continue;
      if (classNames.has(name) || methodNames.has(name)) continue;
      varNames.add(name);
      assign(name, "var");
    }
  }

  // Step 4: apply all replacements globally
  // Sort by length descending to prevent partial replacements
  const allNames = [...nameToMasked.keys()].sort((a, b) => b.length - a.length);

  let result = code;
  // Rebuild skip ranges on result (same positions since we haven't changed yet)
  const finalSkip = buildSkipRanges(result);
  const inFinalSkip = (idx) => finalSkip.some(([s, e]) => idx >= s && idx < e);

  // We'll do a single-pass replacement using a combined regex
  if (allNames.length === 0) return { masked: code, map: nameToMasked };

  const combined = new RegExp(
    `\\b(${allNames.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`,
    "g"
  );

  result = result.replace(combined, (match, name, offset) => {
    if (inFinalSkip(offset)) return match;
    return nameToMasked.get(name) ?? match;
  });

  return { masked: result, map: nameToMasked };
}

// ─── UI ─────────────────────────────────────────────────────────────────────

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

export default function CodeMasker() {
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [mapping, setMapping] = useState([]);
  const [options, setOptions] = useState({
    maskMethods: true,
    maskVariables: true,
    maskClasses: true,
    prefix: "",
  });
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("split");

  const run = useCallback(() => {
    const { masked, map } = maskCode(input, options);
    setOutput(masked);
    const entries = [...map.entries()].map(([original, masked]) => {
      // determine type from masked label
      const type = masked.replace(/^[^a-z]*/, "").startsWith("method")
        ? "method" : masked.includes("Class") ? "class" : "var";
      return { original, masked, type };
    });
    setMapping(entries);
  }, [input, options]);

  const copy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  const typeColor = { method: "#7dd3fc", var: "#86efac", class: "#f9a8d4" };
  const typeLabel = { method: "Method", var: "Variable", class: "Class/DTO" };

  // Derive type from masked name
  const getType = (maskedName, prefix) => {
    const stripped = maskedName.slice(prefix.length);
    if (stripped.startsWith("method")) return "method";
    if (stripped.startsWith("Class")) return "class";
    return "var";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1e2030",
        padding: "18px 28px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "linear-gradient(90deg, #0d0d18 0%, #0a0a0f 100%)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "linear-gradient(135deg, #6366f1, #a855f7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>⬛</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "#c4b5fd" }}>
            CODE MASKER
          </div>
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.12em" }}>
            ANONYMIZE IDENTIFIERS · METHODS · VARIABLES · DTOs
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        padding: "12px 28px",
        borderBottom: "1px solid #1e2030",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        background: "#0c0c15",
      }}>
        {[
          { key: "maskMethods", label: "Methods", color: "#7dd3fc" },
          { key: "maskVariables", label: "Variables", color: "#86efac" },
          { key: "maskClasses", label: "Classes / DTOs", color: "#f9a8d4" },
        ].map(({ key, label, color }) => (
          <button key={key} onClick={() => toggle(key)} style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${options[key] ? color : "#2a2a3a"}`,
            background: options[key] ? `${color}18` : "transparent",
            color: options[key] ? color : "#4a5568",
            fontSize: 11,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "all 0.15s",
            letterSpacing: "0.06em",
          }}>
            {options[key] ? "✓ " : ""}{label}
          </button>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
          <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.1em" }}>PREFIX</span>
          <input
            value={options.prefix}
            onChange={(e) => setOptions((o) => ({ ...o, prefix: e.target.value }))}
            placeholder="e.g. masked_"
            style={{
              background: "#111120",
              border: "1px solid #2a2a3a",
              borderRadius: 6,
              padding: "4px 10px",
              color: "#a78bfa",
              fontSize: 11,
              fontFamily: "inherit",
              width: 120,
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["split", "output", "map"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "none",
              background: tab === t ? "#6366f1" : "#1a1a28",
              color: tab === t ? "#fff" : "#64748b",
              fontSize: 10,
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>{t}</button>
          ))}
        </div>

        <button onClick={run} style={{
          padding: "7px 20px",
          borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #6366f1, #a855f7)",
          color: "#fff",
          fontSize: 11,
          fontFamily: "inherit",
          cursor: "pointer",
          fontWeight: 700,
          letterSpacing: "0.1em",
          boxShadow: "0 0 16px #6366f144",
        }}>▶ MASK</button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {(tab === "split" || tab === "input") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #1e2030" }}>
            <div style={{ padding: "8px 16px", fontSize: 9, color: "#4a5568", letterSpacing: "0.15em", borderBottom: "1px solid #1a1a28" }}>
              INPUT
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#cbd5e1",
                fontFamily: "inherit",
                fontSize: 12,
                lineHeight: 1.7,
                padding: "16px 20px",
                resize: "none",
                whiteSpace: "pre",
              }}
            />
          </div>
        )}

        {(tab === "split" || tab === "output") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 16px", fontSize: 9, color: "#4a5568", letterSpacing: "0.15em", borderBottom: "1px solid #1a1a28", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>OUTPUT</span>
              {output && (
                <button onClick={copy} style={{
                  background: "none", border: "1px solid #2a2a3a", borderRadius: 4,
                  color: copied ? "#86efac" : "#64748b", fontSize: 9, fontFamily: "inherit",
                  cursor: "pointer", padding: "2px 8px", letterSpacing: "0.1em",
                }}>
                  {copied ? "✓ COPIED" : "COPY"}
                </button>
              )}
            </div>
            <pre style={{
              flex: 1, margin: 0, padding: "16px 20px",
              color: output ? "#a5b4fc" : "#2a2a3a",
              fontFamily: "inherit", fontSize: 12, lineHeight: 1.7,
              overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {output || "← Paste code on the left, then click ▶ MASK"}
            </pre>
          </div>
        )}

        {tab === "map" && (
          <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
            {mapping.length === 0 ? (
              <div style={{ color: "#2a2a3a", marginTop: 40, textAlign: "center", fontSize: 12 }}>
                Run masking first to see the identifier map.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    {["Type", "Original", "→", "Masked"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#4a5568", letterSpacing: "0.12em", borderBottom: "1px solid #1e2030" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((row, i) => {
                    const t = getType(row.masked, options.prefix);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #12121e" }}>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{
                            background: `${typeColor[t]}18`,
                            color: typeColor[t],
                            border: `1px solid ${typeColor[t]}44`,
                            borderRadius: 4, padding: "1px 7px", fontSize: 9, letterSpacing: "0.1em",
                          }}>{typeLabel[t]}</span>
                        </td>
                        <td style={{ padding: "7px 12px", color: "#94a3b8" }}>{row.original}</td>
                        <td style={{ padding: "7px 12px", color: "#2a2a3a" }}>→</td>
                        <td style={{ padding: "7px 12px", color: typeColor[t] }}>{row.masked}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}