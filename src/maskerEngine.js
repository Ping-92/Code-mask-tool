export const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
export const TYPE_COLOR = { method: "#7dd3fc", var: "#86efac", class: "#f9a8d4" };
export const TYPE_LABEL = { method: "Method", var: "Variable", class: "Class/DTO" };

export const getType = (maskedName, prefix = "") => {
  const s = maskedName.slice(prefix.length);
  if (s.startsWith("method")) return "method";
  if (s.startsWith("Class")) return "class";
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

function buildSkipRanges(src) {
  const ranges = [];
  for (const p of [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /"(?:[^"\\]|\\.)*"/g, /'(?:[^'\\]|\\.)*'/g, /`(?:[^`\\]|\\.)*`/g])
    for (const m of src.matchAll(p)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

export function maskCode(code, options) {
  const { maskMethods, maskVariables, maskClasses, prefix } = options;
  const nameToMasked = new Map();
  const counters = { method: 0, var: 0, class: 0 };
  const assign = (name, type) => {
    if (!nameToMasked.has(name)) {
      counters[type]++;
      nameToMasked.set(name, `${prefix}${type === "class" ? "Class" : type}_${counters[type]}`);
    }
    return nameToMasked.get(name);
  };
  const skipRanges = buildSkipRanges(code);
  const inSkip = (idx) => skipRanges.some(([s, e]) => idx >= s && idx < e);
  const classNames = new Set();
  if (maskClasses) {
    for (const m of code.matchAll(/\b(?:class|interface|enum|struct|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g))
      if (!inSkip(m.index) && !RESERVED.has(m[1])) { classNames.add(m[1]); assign(m[1], "class"); }
    for (const m of code.matchAll(/\b([A-Z][A-Za-z0-9_]*(?:DTO|Dto|Request|Response|Model|Entity|Vo|Bo))\b/g))
      if (!inSkip(m.index) && !RESERVED.has(m[1])) { classNames.add(m[1]); assign(m[1], "class"); }
  }
  const methodNames = new Set();
  if (maskMethods) {
    for (const m of code.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
      const name = m[1];
      if (inSkip(m.index) || RESERVED.has(name) || classNames.has(name)) continue;
      const before = code.slice(Math.max(0, m.index - 80), m.index);
      const isDef = /(?:public|private|protected|static|async|override|virtual|abstract|def\s)\s*(?:[\w<>\[\]?,\s]+\s+)?$/.test(before)
        || /\bfunction\s+$/.test(before) || /\bdef\s+$/.test(before);
      if (isDef) { methodNames.add(name); assign(name, "method"); }
    }
  }
  if (maskVariables) {
    for (const m of code.matchAll(/\b(?:var|let|const|val|int|long|double|float|boolean|bool|char|byte|short|auto|String|string|object)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      const name = m[1];
      if (!inSkip(m.index) && !RESERVED.has(name) && !classNames.has(name) && !methodNames.has(name)) assign(name, "var");
    }
    for (const m of code.matchAll(/\b[A-Z][A-Za-z0-9_$]*(?:<[^>]+>)?\s+([a-z][A-Za-z0-9_$]*)\s*[=;,)]/g)) {
      const name = m[1];
      if (!inSkip(m.index) && !RESERVED.has(name) && !classNames.has(name) && !methodNames.has(name)) assign(name, "var");
    }
  }
  const allNames = [...nameToMasked.keys()].sort((a, b) => b.length - a.length);
  if (!allNames.length) return { masked: code, map: nameToMasked };
  const fs = buildSkipRanges(code);
  const inFs = (idx) => fs.some(([s, e]) => idx >= s && idx < e);
  const combined = new RegExp(`\\b(${allNames.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
  const masked = code.replace(combined, (match, name, offset) => inFs(offset) ? match : (nameToMasked.get(name) ?? match));
  return { masked, map: nameToMasked };
}

export function applyMapToCode(code, map) {
  const allNames = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!allNames.length) return code;
  const skip = buildSkipRanges(code);
  const inSkip = (idx) => skip.some(([s, e]) => idx >= s && idx < e);
  const combined = new RegExp(`\\b(${allNames.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
  return code.replace(combined, (match, name, offset) => inSkip(offset) ? match : (map.get(name) ?? match));
}

export function unmaskCode(maskedCode, map) {
  const rev = new Map([...map.entries()].map(([o, m]) => [m, o]));
  const allMasked = [...rev.keys()].sort((a, b) => b.length - a.length);
  if (!allMasked.length) return maskedCode;
  const skip = buildSkipRanges(maskedCode);
  const inSkip = (idx) => skip.some(([s, e]) => idx >= s && idx < e);
  const combined = new RegExp(`\\b(${allMasked.map(n => n.replace(/[$]/g, "\\$")).join("|")})\\b`, "g");
  return maskedCode.replace(combined, (match, name, offset) => inSkip(offset) ? match : (rev.get(name) ?? match));
}