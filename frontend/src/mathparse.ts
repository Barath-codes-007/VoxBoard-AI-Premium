// Safe expression parser: no eval, no Function. Supports x, y, parameters, constants and a fixed function list.
export type Env = Record<string, number>;
export type Fn = (x: number, y: number, p: Env) => number;
export type Compiled = { kind: "explicit" | "implicit" | "ineq" | "param" | "polar"; fn: Fn; vars: Set<string>; op?: string; strict?: boolean; holds?: (x: number, y: number, p: Env) => boolean; fx?: Fn; fy?: Fn; t0?: number; t1?: number; piece?: (x: number, p?: Env) => number };
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
    if (c === "<" || c === ">") { if (s[i + 1] === "=") { out.push({ t: "op", v: c + "=" }); i += 2; } else { out.push({ t: "op", v: c }); i++; } continue; }
    if ("+-*/^()|=".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error("Unsupported character '" + c + "'. Use digits, x, y, parameters, + - * / ^, superscripts like x², brackets, |x| and √");
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
      if (t.v === "t") { vars.add("t"); return x => x; }
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

const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")" };
// Normalisation layer: Unicode superscripts, roots and symbols become the parser's own syntax. The text the user typed is kept for display.
export function normalize(src: string): string {
  let s = src.replace(/[−–]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/θ/g, "t").replace(/\btheta\b/gi, "t").replace(/≤/g, "<=").replace(/≥/g, ">=");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+/g, m => "^(" + [...m].map(ch => SUP[ch]).join("") + ")");
  return s.replace(/√\s*\(/g, "sqrt(").replace(/√\s*([A-Za-z0-9.]+)/g, "sqrt($1)");
}
const REL = ["=", "<", ">", "<=", ">="];
const TWO_PI = 2 * Math.PI;
function splitTop(s: string, sep: string): string[] { const out: string[] = []; let d = 0, st = 0; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === "(" || ch === "[") d++; else if (ch === ")" || ch === "]") d--; else if (ch === sep && d === 0) { out.push(s.slice(st, i)); st = i + 1; } } out.push(s.slice(st)); return out; }
const konst = (txt: string) => { const v = new Set<string>(); const n = parse(lex(txt), v)(0, 0, {}); if (v.size || !isFinite(n)) throw new Error("Range limits must be plain numbers, for example t in [0, 2π]"); return n; };

function core(s: string): Compiled {
  const toks = lex(s); const rel = toks.map((t, i) => (t.t === "op" && REL.includes(t.v) ? i : -1)).filter(i => i >= 0);
  if (rel.length > 1) throw new Error("Only one relation (=, <, >, <=, >=) is allowed. For a circle write x² + y² = 25");
  if (!rel.length) { const vars = new Set<string>(); const fn = parse(toks, vars); if (vars.has("y")) throw new Error("Use = for equations that contain y, e.g. x² + y² = 25"); return { kind: "explicit", fn, vars }; }
  const op = toks[rel[0]].v, L = toks.slice(0, rel[0]), R = toks.slice(rel[0] + 1);
  if (op === "=") {
    if (L.length === 1 && L[0].v === "y" && L[0].t === "id") { const vars = new Set<string>(); const fn = parse(R, vars); if (!vars.has("y")) return { kind: "explicit", fn, vars }; }
    const vars = new Set<string>(); const l = parse(L, vars), r = parse(R, vars);
    return { kind: "implicit", fn: (x, y, e) => l(x, y, e) - r(x, y, e), vars };
  }
  const vars = new Set<string>(); const l = parse(L, vars), r = parse(R, vars); const fn: Fn = (x, y, e) => l(x, y, e) - r(x, y, e);
  return { kind: "ineq", fn, vars, op, strict: op === "<" || op === ">", holds: (x, y, e) => { const v = fn(x, y, e); return isFinite(v) && (op === ">" ? v > 0 : op === ">=" ? v >= 0 : op === "<" ? v < 0 : v <= 0); } };
}

// y = { x < 0: -x; 0 <= x < 2: x^2; else: 4 }
function piecewise(body: string): Compiled {
  const parts = body.split(";").map(p => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Piecewise needs at least one piece, e.g. y = {x < 0: -x; x >= 0: x^2}");
  if (parts.length > 8) throw new Error("At most 8 pieces");
  const vars = new Set<string>(); const pcs: { cond: ((x: number, p: Env) => boolean) | null; val: Fn }[] = [];
  for (const part of parts) {
    const k = part.indexOf(":"); if (k < 0) throw new Error("Each piece needs 'condition: expression', for example x < 0: -x");
    const cs = part.slice(0, k).trim(), val = parse(lex(part.slice(k + 1)), vars);
    if (/^(else|otherwise)$/i.test(cs)) { pcs.push({ cond: null, val }); continue; }
    const toks = lex(cs), ops = toks.map((t, i) => (t.t === "op" && ["<", ">", "<=", ">="].includes(t.v) ? i : -1)).filter(i => i >= 0);
    if (!ops.length) throw new Error("A condition needs <, >, <= or >=, for example 0 <= x < 2");
    const operands: Fn[] = []; let st = 0; ops.forEach(i => { operands.push(parse(toks.slice(st, i), vars)); st = i + 1; }); operands.push(parse(toks.slice(st), vars));
    const rels = ops.map(i => toks[i].v);
    pcs.push({ cond: (x, p) => rels.every((r, i) => { const a = operands[i](x, 0, p), b = operands[i + 1](x, 0, p); return r === "<" ? a < b : r === ">" ? a > b : r === "<=" ? a <= b : a >= b; }), val });
  }
  if (vars.has("y")) throw new Error("Piecewise conditions and values use x only");
  const pick = (x: number, p: Env) => pcs.findIndex(q => !q.cond || q.cond(x, p));
  return { kind: "explicit", vars, fn: (x, _y, p) => { const i = pick(x, p); return i < 0 ? NaN : pcs[i].val(x, 0, p); }, piece: (x, p) => pick(x, p ?? {}) };
}

function single(s0: string): Compiled {
  let s = s0, range: number[] | null = null;
  const m = /(?:,\s*|\s+)(?:for\s+)?t\s*(?:in|∈)\s*\[([^\]]+),([^\]]+)\]\s*$/i.exec(s);
  if (m) { range = [konst(m[1]), konst(m[2])]; s = s.slice(0, m.index).trim(); if (!(range[1] > range[0])) throw new Error("In a t range the lower limit must be smaller than the upper limit"); }
  let inner = s; if (inner.startsWith("(") && inner.endsWith(")") && splitTop(inner, ",").length === 1) inner = inner.slice(1, -1);
  const parts = splitTop(inner, ",");
  if (parts.length > 2) throw new Error("A parametric curve has exactly two parts: (x(t), y(t))");
  if (parts.length === 2) {
    let [a, b] = parts.map(p => p.trim()); if (/^y\s*=/.test(a) && /^x\s*=/.test(b)) [a, b] = [b, a];
    const strip = (p: string) => p.replace(/^[xy]\s*=\s*/, ""), vars = new Set<string>(); const fx = parse(lex(strip(a)), vars), fy = parse(lex(strip(b)), vars);
    if (vars.has("x") || vars.has("y")) throw new Error("In a parametric curve use t, not x or y, for example (2cos(t), 2sin(t))");
    const [t0, t1] = range ?? [0, TWO_PI]; return { kind: "param", fn: fx, fx, fy, t0, t1, vars };
  }
  const pm = /^r\s*=(.*)$/i.exec(s);
  if (pm) { const vars = new Set<string>(); const fn = parse(lex(pm[1]), vars); if (vars.has("x") || vars.has("y")) throw new Error("In a polar equation use t (or θ), for example r = 1 + cos(θ)"); const [t0, t1] = range ?? [0, TWO_PI]; return { kind: "polar", fn, vars, t0, t1 }; }
  if (range) throw new Error("A t range only applies to parametric curves and polar equations");
  return core(s);
}

export function compile(src: string): Compiled {
  const s = normalize(src).trim(); if (!s) throw new Error("Enter an equation"); if (s.length > 300) throw new Error("Equation is too long (300 characters max)");
  const pw = /^(?:y\s*=\s*)?\{([\s\S]*)\}$/.exec(s); const res = pw ? piecewise(pw[1]) : single(s);
  if (res.kind !== "param" && res.kind !== "polar" && res.vars.has("t")) throw new Error("t is only for parametric (x(t), y(t)) and polar (r = f(t)) equations");
  return res;
}
