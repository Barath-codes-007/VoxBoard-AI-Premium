// Safe expression parser: no eval, no Function. Supports x, y, parameters, constants and a fixed function list.
export type Env = Record<string, number>;
export type Fn = (x: number, y: number, p: Env) => number;
export type Compiled = { kind: "explicit" | "implicit"; fn: Fn; vars: Set<string> };
const FUN: Record<string, (v: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sign: Math.sign };
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };
export const PARAMS = "abcdkmnpq";
type Tok = { t: "n" | "id" | "op"; v: string; n?: number };

function lex(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error("Bad number near '" + s.slice(i, i + 4) + "'"); out.push({ t: "n", v: m[0], n: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (/[A-Za-z]/.test(c)) { const m = /^[A-Za-z]+/.exec(s.slice(i))![0]; i += m.length; const l = m.toLowerCase(); if (FUN[l] || l in CONST) out.push({ t: "id", v: l }); else for (const ch of l) out.push({ t: "id", v: ch }); continue; }
    if ("+-*/^()|=".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error("Unsupported character '" + c + "'");
  }
  return out;
}

function parse(toks: Tok[], vars: Set<string>): Fn {
  if (!toks.length) throw new Error("Missing expression");
  let p = 0, absOpen = 0, depth = 0;
  const isOp = (v: string) => toks[p]?.t === "op" && toks[p].v === v;
  const startsPrimary = () => { const t = toks[p]; return !!t && (t.t === "n" || t.t === "id" || (t.t === "op" && t.v === "(")); };
  const expr = (): Fn => { let l = term(); while (isOp("+") || isOp("-")) { const op = toks[p++].v; const r = term(), a = l; l = op === "+" ? (x, y, e) => a(x, y, e) + r(x, y, e) : (x, y, e) => a(x, y, e) - r(x, y, e); } return l; };
  const term = (): Fn => { let l = unary(); for (;;) {
    if (isOp("*") || isOp("/")) { const op = toks[p++].v; const r = unary(), a = l; l = op === "*" ? (x, y, e) => a(x, y, e) * r(x, y, e) : (x, y, e) => a(x, y, e) / r(x, y, e); }
    else if (startsPrimary() || (isOp("|") && absOpen === 0)) { const r = power(), a = l; l = (x, y, e) => a(x, y, e) * r(x, y, e); }
    else return l; } };
  const unary = (): Fn => { if (isOp("-")) { p++; const a = unary(); return (x, y, e) => -a(x, y, e); } if (isOp("+")) { p++; return unary(); } return power(); };
  const power = (): Fn => { const b = primary(); if (isOp("^")) { p++; const ex = unary(); return (x, y, e) => Math.pow(b(x, y, e), ex(x, y, e)); } return b; };
  const group = (close: string): Fn => { if (++depth > 40) throw new Error("Expression is nested too deeply"); const a = expr(); if (!isOp(close)) throw new Error("Missing " + close); p++; depth--; return a; };
  const primary = (): Fn => {
    const t = toks[p++]; if (!t) throw new Error("Expression ended unexpectedly");
    if (t.t === "n") { const v = t.n!; return () => v; }
    if (t.t === "id") {
      if (FUN[t.v]) { if (!isOp("(")) throw new Error("Write " + t.v + "(...) with brackets"); p++; const a = group(")"), f = FUN[t.v]; return (x, y, e) => f(a(x, y, e)); }
      if (t.v in CONST) { const v = CONST[t.v]; return () => v; }
      if (t.v === "x") { vars.add("x"); return x => x; }
      if (t.v === "y") { vars.add("y"); return (_x, y) => y; }
      if (PARAMS.includes(t.v)) { vars.add(t.v); const k = t.v; return (_x, _y, e) => e[k] ?? 1; }
      throw new Error("Unknown symbol '" + t.v + "'. Use x, y, parameters (a b c d k m n p q) or functions like sin(x)");
    }
    if (t.v === "(") return group(")");
    if (t.v === "|") { absOpen++; const a = expr(); if (!isOp("|")) throw new Error("Missing closing |"); p++; absOpen--; return (x, y, e) => Math.abs(a(x, y, e)); }
    throw new Error("Unexpected '" + t.v + "'");
  };
  const f = expr(); if (p < toks.length) throw new Error("Unexpected '" + toks[p].v + "'"); return f;
}

export function compile(src: string): Compiled {
  const s = src.trim(); if (!s) throw new Error("Enter an equation"); if (s.length > 200) throw new Error("Equation is too long (200 characters max)");
  const toks = lex(s); const eqs = toks.map((t, i) => (t.t === "op" && t.v === "=" ? i : -1)).filter(i => i >= 0);
  if (eqs.length > 1) throw new Error("Only one = is allowed");
  if (!eqs.length) { const vars = new Set<string>(); const fn = parse(toks, vars); if (vars.has("y")) throw new Error("Use = for equations that contain y, e.g. x^2 + y^2 = 25"); return { kind: "explicit", fn, vars }; }
  const L = toks.slice(0, eqs[0]), R = toks.slice(eqs[0] + 1);
  if (L.length === 1 && L[0].v === "y" && L[0].t === "id") { const vars = new Set<string>(); const fn = parse(R, vars); if (!vars.has("y")) return { kind: "explicit", fn, vars }; }
  const vars = new Set<string>(); const l = parse(L, vars), r = parse(R, vars);
  return { kind: "implicit", fn: (x, y, e) => l(x, y, e) - r(x, y, e), vars };
}
