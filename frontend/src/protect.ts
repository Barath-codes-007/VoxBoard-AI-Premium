// Protects numbers, units, chemical formulas and simple equations from machine translation by masking them.
const UNIT = "(?:%|°[CF]?|[kmcµn]?(?:m|g|s|L|N|J|W|V|A|Hz|Pa|mol|K)\\b)";
const RE = new RegExp(`(?:[A-Za-z0-9_^().]+(?:\\s*[=<>≤≥≈+*×÷^]\\s*[A-Za-z0-9_^().]+)+)|(?:\\b(?:[A-Z][a-z]?\\d*){2,}\\b)|(?:\\d[\\d.,]*(?:\\s?${UNIT})?)`, "g");
const KEEP = /[\d=^<>≤≥≈×÷+*]/, CHEM = /^(?:[A-Z][a-z]?\d*){2,}$/;
export function protect(text: string) {
  const toks: string[] = [];
  const masked = text.replace(RE, m => { if (!(KEEP.test(m) || CHEM.test(m))) return m; toks.push(m); return `XQ${toks.length - 1}X`; });
  return { masked, toks };
}
export function restore(text: string, toks: string[]) {
  const seen = new Set<number>();
  const out = text.replace(/XQ\s?(\d+)\s?X/g, (m, i) => { const n = +i; if (n < toks.length) { seen.add(n); return toks[n]; } return m; });
  return { text: out, ok: seen.size === toks.length };
}
