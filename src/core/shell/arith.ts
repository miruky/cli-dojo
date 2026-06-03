import type { Environment } from "./Environment";

/** シェル算術 $(( ... )) の評価。変数の読み書き/インクリメントに対応。 */
type ATok = { t: string; v: string };

function lex(s: string): ATok[] {
  const toks: ATok[] = [];
  let i = 0;
  const two = ["**", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%="];
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === "0" && (s[i + 1] === "x" || s[i + 1] === "X"))) {
      let j = i;
      if (s[i] === "0" && (s[i + 1] === "x" || s[i + 1] === "X")) {
        j = i + 2;
        while (j < s.length && /[0-9a-fA-F]/.test(s[j])) j++;
      } else {
        while (j < s.length && /[\d.]/.test(s[j])) j++;
      }
      toks.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      toks.push({ t: "name", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "$") {
      // $var の $ は無視 (算術では変数名で参照)
      i++;
      continue;
    }
    const t2 = s.substr(i, 2);
    if (two.includes(t2)) {
      toks.push({ t: "op", v: t2 });
      i += 2;
      continue;
    }
    toks.push({ t: "op", v: c });
    i++;
  }
  toks.push({ t: "eof", v: "" });
  return toks;
}

export function evalArith(expr: string, env: Environment): number {
  const toks = lex(expr);
  let pos = 0;
  const peek = (): ATok => toks[pos];
  const next = (): ATok => toks[pos++];
  const eat = (v: string): void => {
    if (peek().v === v) pos++;
  };

  const getVar = (name: string): number => {
    const v = env.get(name);
    if (v === undefined || v === "") return 0;
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  };
  const setVar = (name: string, val: number): number => {
    env.set(name, String(val));
    return val;
  };

  // 代入 (右結合)
  function parseAssign(): number {
    if (peek().t === "name" && toks[pos + 1] && /^(=|\+=|-=|\*=|\/=|%=)$/.test(toks[pos + 1].v)) {
      const name = next().v;
      const op = next().v;
      const rhs = parseAssign();
      const cur = getVar(name);
      const val =
        op === "=" ? rhs :
        op === "+=" ? cur + rhs :
        op === "-=" ? cur - rhs :
        op === "*=" ? cur * rhs :
        op === "/=" ? Math.trunc(cur / rhs) :
        cur % rhs;
      return setVar(name, val);
    }
    return parseTernary();
  }
  function parseTernary(): number {
    const c = parseOr();
    if (peek().v === "?") {
      next();
      const a = parseAssign();
      eat(":");
      const b = parseAssign();
      return c !== 0 ? a : b;
    }
    return c;
  }
  function parseOr(): number {
    let l = parseAnd();
    while (peek().v === "||") {
      next();
      const r = parseAnd();
      l = l !== 0 || r !== 0 ? 1 : 0;
    }
    return l;
  }
  function parseAnd(): number {
    let l = parseBitOr();
    while (peek().v === "&&") {
      next();
      const r = parseBitOr();
      l = l !== 0 && r !== 0 ? 1 : 0;
    }
    return l;
  }
  function parseBitOr(): number {
    let l = parseBitXor();
    while (peek().v === "|") {
      next();
      l = (l | parseBitXor()) >>> 0;
    }
    return l;
  }
  function parseBitXor(): number {
    let l = parseBitAnd();
    while (peek().v === "^") {
      next();
      l = (l ^ parseBitAnd()) >>> 0;
    }
    return l;
  }
  function parseBitAnd(): number {
    let l = parseEq();
    while (peek().v === "&") {
      next();
      l = (l & parseEq()) >>> 0;
    }
    return l;
  }
  function parseEq(): number {
    let l = parseRel();
    while (peek().v === "==" || peek().v === "!=") {
      const op = next().v;
      const r = parseRel();
      l = op === "==" ? (l === r ? 1 : 0) : l !== r ? 1 : 0;
    }
    return l;
  }
  function parseRel(): number {
    let l = parseShift();
    while (["<", "<=", ">", ">="].includes(peek().v)) {
      const op = next().v;
      const r = parseShift();
      l = op === "<" ? (l < r ? 1 : 0) : op === "<=" ? (l <= r ? 1 : 0) : op === ">" ? (l > r ? 1 : 0) : l >= r ? 1 : 0;
    }
    return l;
  }
  function parseShift(): number {
    let l = parseAdd();
    while (peek().v === "<<" || peek().v === ">>") {
      const op = next().v;
      const r = parseAdd();
      l = op === "<<" ? l << r : l >> r;
    }
    return l;
  }
  function parseAdd(): number {
    let l = parseMul();
    while (peek().v === "+" || peek().v === "-") {
      const op = next().v;
      const r = parseMul();
      l = op === "+" ? l + r : l - r;
    }
    return l;
  }
  function parseMul(): number {
    let l = parsePow();
    while (["*", "/", "%"].includes(peek().v)) {
      const op = next().v;
      const r = parsePow();
      l = op === "*" ? l * r : op === "/" ? Math.trunc(l / r) : l % r;
    }
    return l;
  }
  function parsePow(): number {
    const l = parseUnary();
    if (peek().v === "**") {
      next();
      return Math.pow(l, parsePow());
    }
    return l;
  }
  function parseUnary(): number {
    const t = peek();
    if (t.v === "-") {
      next();
      return -parseUnary();
    }
    if (t.v === "+") {
      next();
      return parseUnary();
    }
    if (t.v === "!") {
      next();
      return parseUnary() === 0 ? 1 : 0;
    }
    if (t.v === "~") {
      next();
      return ~parseUnary();
    }
    if (t.v === "++" || t.v === "--") {
      next();
      const name = next().v;
      const val = getVar(name) + (t.v === "++" ? 1 : -1);
      return setVar(name, val);
    }
    return parsePostfix();
  }
  function parsePostfix(): number {
    const v = parsePrimary();
    return v;
  }
  function parsePrimary(): number {
    const t = peek();
    if (t.v === "(") {
      next();
      const v = parseAssign();
      eat(")");
      return v;
    }
    if (t.t === "num") {
      next();
      return t.v.startsWith("0x") || t.v.startsWith("0X") ? parseInt(t.v, 16) : parseFloat(t.v);
    }
    if (t.t === "name") {
      next();
      if (peek().v === "++" || peek().v === "--") {
        const op = next().v;
        const cur = getVar(t.v);
        setVar(t.v, cur + (op === "++" ? 1 : -1));
        return cur;
      }
      return getVar(t.v);
    }
    next();
    return 0;
  }

  return Math.trunc(parseAssign());
}
