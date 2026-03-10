export const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
export const TYPE_COLOR = { method: "#7dd3fc", var: "#86efac", class: "#f9a8d4", annotation: "#fbbf24" };
export const TYPE_LABEL = { method: "Method", var: "Variable", class: "Class/DTO", annotation: "Annotation" };

export const getType = (maskedName, prefix = "") => {
  const s = maskedName.slice(prefix.length);
  if (s.startsWith("method")) return "method";
  if (s.startsWith("Class")) return "class";
  if (s.startsWith("annot")) return "annotation";
  return "var";
};

export const copyToClipboard = (text, setCopied) => {
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 1800);
};

const RESERVED = new Set([
  "if","else","for","while","do","switch","case","break","continue","return",
  "new","this","super","null","true","false","void","class","interface","enum",
  "extends","implements","import","package","public","private","protected",
  "static","final","abstract","synchronized","try","catch","finally","throw",
  "throws","instanceof","int","long","double","float","boolean","char","byte",
  "short","String","var","let","const","function","async","await","typeof",
  "undefined","in","of","from","export","default","type","struct","record",
  "override","sealed","partial","virtual","readonly","get","set","string","bool",
  "object","List","Map","Set","Optional","auto","val","def","self","cls",
  "None","pass","lambda","yield","with","as","and","or","not","is","elif",
  "print","len","range","True","False",
]);

// Annotation attributes whose STRING VALUES should be masked
const MASKED_ANNOTATION_ATTRS = new Set([
  "name", "mappedBy", "value", "column", "table", "joinColumn",
  "referencedColumnName", "sequenceName", "catalog", "schema",
  "columnDefinition", "targetEntity",
]);

function buildSkipRanges(src) {
  const ranges = [];
  for (const p of [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /`(?:[^`\\]|\\.)*`/g])
    for (const m of src.matchAll(p)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// Separate skip ranges that INCLUDE string literals (used for non-annotation masking)
function buildFullSkipRanges(src) {
  const ranges = [];
  for (const p of [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g, /`(?:[^`\\]|\\.)*`/g])
    for (const m of src.matchAll(p)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

export function maskCode(code, options) {
  const { maskMethods, maskVariables, maskClasses, maskAnnotations, maskImports, prefix } = options;
  const nameToMasked = new Map();
  const counters = { method: 0, var: 0, class: 0, annot: 0 };

  const assign = (name, type) => {
    if (!nameToMasked.has(name)) {
      counters[type]++;
      const label = type === "class" ? "Class" : type === "annot" ? "annot" : type;
      nameToMasked.set(name, `${prefix}${label}_${counters[type]}`);
    }
    return nameToMasked.get(name);
  };

   // ── Step 0: Remove imports ──
  let result = maskImports ? removeImports(code) : code;

  // ── Step 1: Mask annotation string values FIRST (before other passes) ──
  // Matches: name = "someValue", mappedBy = "someValue", value = "someValue"
  // Also handles: @Annotation("someValue") shorthand (bare string = implicit value)
  if (maskAnnotations) {
    // Named attributes: attr = "value" or attr = 'value' inside @Annotation(...)
    result = result.replace(
      /@[A-Za-z][A-Za-z0-9_]*\s*\(([^)]*)\)/g,
      (annotMatch, inner, annotOffset) => {
        const maskedInner = inner.replace(
          /\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(["'])([^"']*)\2/g,
          (attrMatch, attrName, quote, attrValue) => {
            if (!MASKED_ANNOTATION_ATTRS.has(attrName)) return attrMatch;
            const masked = assign(attrValue, "annot");
            return `${attrName} = ${quote}${masked}${quote}`;
          }
        );
        // Bare string shorthand: @Column("tableName") or @Value("someVal")
        const maskedShorthand = maskedInner.replace(
          /^(\s*)(["'])([^"']+)\2(\s*)$/,
          (_, pre, quote, val, post) => {
            const masked = assign(val, "annot");
            return `${pre}${quote}${masked}${quote}${post}`;
          }
        );
        return annotMatch.replace(inner, maskedShorthand);
      }
    );
  }

  const skipRanges = buildFullSkipRanges(result);
  const inSkip = (idx) => skipRanges.some(([s, e]) => idx >= s && idx < e);

  // ── Step 2: Classes ──
  const classNames = new Set();
  if (maskClasses) {
    for (const m of result.matchAll(/\b(?:class|interface|enum|struct|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g))
      if (!inSkip(m.index) && !RESERVED.has(m[1])) { classNames.add(m[1]); assign(m[1], "class"); }
    for (const m of result.matchAll(/\b([A-Z][A-Za-z0-9_]*(?:DTO|Dto|Request|Response|Model|Entity|Vo|Bo))\b/g))
      if (!inSkip(m.index) && !RESERVED.has(m[1])) { classNames.add(m[1]); assign(m[1], "class"); }
  }

// ── Step 3: Methods ──
  const methodNames = new Set();
  if (maskMethods) {
    for (const m of result.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
      const name = m[1];
      if (inSkip(m.index) || RESERVED.has(name) || classNames.has(name)) continue;
      const before = result.slice(Math.max(0, m.index - 80), m.index);
      const isDef =
        /(?:public|private|protected|static|async|override|virtual|abstract|def\s)\s*(?:[\w<>\[\]?,\s]+\s+)?$/.test(before)
        || /\bfunction\s+$/.test(before)
        || /\bdef\s+$/.test(before);
      if (isDef) { methodNames.add(name); assign(name, "method"); }
    }

// Getter / setter definitions and calls: getXxx setXxx isXxx
    for (const m of result.matchAll(/\b((?:get|set|is)[A-Z][A-Za-z0-9_]*)\s*\(/g)) {
      const name = m[1];
      if (inSkip(m.index) || RESERVED.has(name)) continue;
      methodNames.add(name);
      assign(name, "method");
    }
  }

  // ── Step 4: Variables ──
  if (maskVariables) {
    for (const m of result.matchAll(/\b(?:var|let|const|val|int|long|double|float|boolean|bool|char|byte|short|auto|String|string|object)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      const name = m[1];
      if (!inSkip(m.index) && !RESERVED.has(name) && !classNames.has(name) && !methodNames.has(name)) assign(name, "var");
    }
    for (const m of result.matchAll(/\b[A-Z][A-Za-z0-9_$]*(?:<[^>]+>)?\s+([a-z][A-Za-z0-9_$]*)\s*[=;,)]/g)) {
      const name = m[1];
      if (!inSkip(m.index) && !RESERVED.has(name) && !classNames.has(name) && !methodNames.has(name)) assign(name, "var");
    }
    // Names ending in Service, Config, Client — fields, params, local vars
    for (const m of result.matchAll(/\b([a-z][A-Za-z0-9_]*(?:Service|Config|Client))\b/g)) {
      const name = m[1];
      if (inSkip(m.index) || RESERVED.has(name) || classNames.has(name) || methodNames.has(name)) continue;
      assign(name, "var");
    }
  }

  // ── Step 5: Global replacement pass for identifier names ──
  const identifierNames = [...nameToMasked.keys()]
    .filter(k => !k.includes(" ") && /^[A-Za-z_$]/.test(k)) // only valid identifiers, not string values
    .sort((a, b) => b.length - a.length);

  if (identifierNames.length) {
    const fs = buildFullSkipRanges(result);
    const inFs = (idx) => fs.some(([s, e]) => idx >= s && idx < e);
    const combined = new RegExp(`\\b(${identifierNames.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
    result = result.replace(combined, (match, name, offset) => inFs(offset) ? match : (nameToMasked.get(name) ?? match));
  }

  return { masked: result, map: nameToMasked };
}

export function applyMapToCode(code, map) {
  // Apply identifier names
  const identNames = [...map.keys()].filter(k => /^[A-Za-z_$]/.test(k)).sort((a, b) => b.length - a.length);
  // Apply annotation string values
  const stringValues = [...map.keys()].filter(k => !/^[A-Za-z_$]/.test(k) || k.includes(" "));

  let result = code;

  // Re-mask annotation strings
  if (stringValues.length) {
    result = result.replace(
      /@[A-Za-z][A-Za-z0-9_]*\s*\(([^)]*)\)/g,
      (annotMatch, inner) => {
        const maskedInner = inner.replace(
          /\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(["'])([^"']*)\2/g,
          (attrMatch, attrName, quote, attrValue) => {
            if (!MASKED_ANNOTATION_ATTRS.has(attrName)) return attrMatch;
            const masked = map.get(attrValue);
            return masked ? `${attrName} = ${quote}${masked}${quote}` : attrMatch;
          }
        );
        return annotMatch.replace(inner, maskedInner);
      }
    );
  }

  if (!identNames.length) return result;
  const skip = buildFullSkipRanges(result);
  const inSkip = (idx) => skip.some(([s, e]) => idx >= s && idx < e);
  const combined = new RegExp(`\\b(${identNames.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
  return result.replace(combined, (match, name, offset) => inSkip(offset) ? match : (map.get(name) ?? match));
}

function removeImports(code) {
  return code
    // Java/Kotlin: import com.example.something;
    .replace(/^import\s+[\w.]+(?:\.\*)?;\s*\n?/gm, "")
    // Python: import x / from x import y
    .replace(/^(?:import\s+[\w.,\s]+|from\s+[\w.]+\s+import\s+[\w.,\s*]+)\s*\n?/gm, "")
    // JS/TS: import ... from '...' or require(...)
    .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*\n?/gm, "")
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*\n?/gm, "")
    .replace(/^const\s+.*?=\s*require\s*\(['"][^'"]+['"]\)\s*;?\s*\n?/gm, "")
    // C#: using System.Something;
    .replace(/^using\s+[\w.]+\s*;\s*\n?/gm, "")
    // C/C++: #include <x> or #include "x"
    .replace(/^#include\s*[<"][^>"]+[>"]\s*\n?/gm, "")
    // Clean up excess blank lines left behind
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

export function unmaskCode(maskedCode, map) {
  const rev = new Map([...map.entries()].map(([o, m]) => [m, o]));
  let result = maskedCode;

  // Unmask annotation string values
  result = result.replace(
    /@[A-Za-z][A-Za-z0-9_]*\s*\(([^)]*)\)/g,
    (annotMatch, inner) => {
      const unmaskedInner = inner.replace(
        /\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(["'])([^"']*)\2/g,
        (attrMatch, attrName, quote, attrValue) => {
          const original = rev.get(attrValue);
          return original ? `${attrName} = ${quote}${original}${quote}` : attrMatch;
        }
      );
      return annotMatch.replace(inner, unmaskedInner);
    }
  );

  // Unmask identifiers
  const allMasked = [...rev.keys()].filter(k => /^[A-Za-z_$]/.test(k)).sort((a, b) => b.length - a.length);
  if (!allMasked.length) return result;
  const skip = buildFullSkipRanges(result);
  const inSkip = (idx) => skip.some(([s, e]) => idx >= s && idx < e);
  const combined = new RegExp(`\\b(${allMasked.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
  return result.replace(combined, (match, name, offset) => inSkip(offset) ? match : (rev.get(name) ?? match));
}