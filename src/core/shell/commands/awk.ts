import type { Command, ExecContext } from "../types";

/** awk: パターン/アクション言語の実用サブセット実装 (字句→構文→評価)。 */

// ===== 字句解析 =====
type Tok = { type: string; value: string };

const KEYWORDS = new Set([
  "BEGIN", "END", "function", "func", "if", "else", "while", "for", "do",
  "break", "continue", "next", "nextfile", "exit", "return", "delete", "in",
  "print", "printf", "getline",
]);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  let prev: Tok | null = null;
  const push = (t: Tok): void => {
    toks.push(t);
    prev = t;
  };
  const regexAllowed = (): boolean => {
    if (!prev) return true;
    if (prev.type === "SEMI") return true;
    if (prev.type === "KEYWORD") return true;
    if (prev.type === "OP") return prev.value !== ")" && prev.value !== "]";
    return false;
  };
  while (i < n) {
    const c = src[i];
    if (c === "\\" && src[i + 1] === "\n") {
      i += 2;
      continue;
    }
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "\n" || c === ";") {
      push({ type: "SEMI", value: ";" });
      i++;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"') {
      i++;
      let s = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          const nx = src[i + 1];
          s += nx === "n" ? "\n" : nx === "t" ? "\t" : nx === "r" ? "\r" : nx === "\\" ? "\\" : nx === '"' ? '"' : nx === "/" ? "/" : "\\" + nx;
          i += 2;
        } else s += src[i++];
      }
      i++;
      push({ type: "STR", value: s });
      continue;
    }
    if (c === "/" && regexAllowed()) {
      i++;
      let s = "";
      let inClass = false;
      while (i < n && (src[i] !== "/" || inClass)) {
        if (src[i] === "\\") {
          s += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        s += src[i++];
      }
      i++;
      push({ type: "ERE", value: s });
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      let s = "";
      while (i < n && /[\d.eE]/.test(src[i])) {
        if ((src[i] === "e" || src[i] === "E") && (src[i + 1] === "+" || src[i + 1] === "-")) {
          s += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        s += src[i++];
      }
      push({ type: "NUM", value: s });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let s = "";
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) s += src[i++];
      if (KEYWORDS.has(s)) push({ type: "KEYWORD", value: s });
      else if (src[i] === "(") push({ type: "FUNCNAME", value: s });
      else push({ type: "NAME", value: s });
      continue;
    }
    // 演算子
    const three = src.substr(i, 2);
    const ops2 = ["==", "!=", "<=", ">=", "&&", "||", "!~", "++", "--", "+=", "-=", "*=", "/=", "%=", "^=", ">>", "**"];
    if (ops2.includes(three)) {
      push({ type: "OP", value: three === "**" ? "^" : three });
      i += 2;
      continue;
    }
    push({ type: "OP", value: c });
    i++;
  }
  push({ type: "EOF", value: "" });
  return toks;
}

// ===== AST =====
type Node = any;
interface Rule {
  kind: "BEGIN" | "END" | "main";
  pattern?: Node;
  pattern2?: Node;
  action: Node[] | null;
  rangeActive?: boolean;
}

// ===== 構文解析 =====
class Parser {
  private pos = 0;
  functions = new Map<string, { params: string[]; body: Node[] }>();
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok {
    return this.toks[this.pos + o] ?? { type: "EOF", value: "" };
  }
  private next(): Tok {
    return this.toks[this.pos++] ?? { type: "EOF", value: "" };
  }
  private is(type: string, value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  private eat(type: string, value?: string): Tok {
    if (!this.is(type, value)) throw new Error(`awk: 構文エラー (${value ?? type} を期待, '${this.peek().value}')`);
    return this.next();
  }
  private skipSemis(): void {
    while (this.is("SEMI")) this.next();
  }

  parseProgram(): Rule[] {
    const rules: Rule[] = [];
    this.skipSemis();
    while (!this.is("EOF")) {
      if (this.is("KEYWORD", "function") || this.is("KEYWORD", "func")) {
        this.parseFunction();
        this.skipSemis();
        continue;
      }
      rules.push(this.parseRule());
      this.skipSemis();
    }
    return rules;
  }

  private parseFunction(): void {
    this.next(); // function
    const name = this.next().value;
    this.eat("OP", "(");
    const params: string[] = [];
    while (!this.is("OP", ")")) {
      params.push(this.eat("NAME").value);
      if (this.is("OP", ",")) this.next();
    }
    this.eat("OP", ")");
    this.skipSemis();
    const body = this.parseBlock();
    this.functions.set(name, { params, body });
  }

  private parseRule(): Rule {
    if (this.is("KEYWORD", "BEGIN")) {
      this.next();
      return { kind: "BEGIN", action: this.parseBlock() };
    }
    if (this.is("KEYWORD", "END")) {
      this.next();
      return { kind: "END", action: this.parseBlock() };
    }
    if (this.is("OP", "{")) {
      return { kind: "main", action: this.parseBlock() };
    }
    const pattern = this.parseExpr();
    let pattern2: Node | undefined;
    if (this.is("OP", ",")) {
      this.next();
      pattern2 = this.parseExpr();
    }
    let action: Node[] | null = null;
    if (this.is("OP", "{")) action = this.parseBlock();
    return { kind: "main", pattern, pattern2, action };
  }

  private parseBlock(): Node[] {
    this.eat("OP", "{");
    const stmts: Node[] = [];
    this.skipSemis();
    while (!this.is("OP", "}") && !this.is("EOF")) {
      stmts.push(this.parseStmt());
      this.skipSemis();
    }
    this.eat("OP", "}");
    return stmts;
  }

  private parseStmt(): Node {
    const t = this.peek();
    if (t.type === "OP" && t.value === "{") return { type: "block", body: this.parseBlock() };
    if (t.type === "KEYWORD") {
      switch (t.value) {
        case "print":
        case "printf":
          return this.parsePrint(t.value);
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "for":
          return this.parseFor();
        case "do":
          return this.parseDoWhile();
        case "next":
          this.next();
          return { type: "next" };
        case "nextfile":
          this.next();
          return { type: "next" };
        case "break":
          this.next();
          return { type: "break" };
        case "continue":
          this.next();
          return { type: "continue" };
        case "exit":
          this.next();
          return { type: "exit", arg: this.isStmtEnd() ? null : this.parseExpr() };
        case "return":
          this.next();
          return { type: "return", arg: this.isStmtEnd() ? null : this.parseExpr() };
        case "delete": {
          this.next();
          const name = this.eat("NAME").value;
          let index: Node | null = null;
          if (this.is("OP", "[")) {
            this.next();
            index = this.parseExprList();
            this.eat("OP", "]");
          }
          return { type: "delete", name, index };
        }
      }
    }
    return { type: "exprstmt", expr: this.parseExpr() };
  }

  private isStmtEnd(): boolean {
    return this.is("SEMI") || this.is("OP", "}") || this.is("EOF");
  }

  private parsePrint(kind: string): Node {
    this.next();
    const args: Node[] = [];
    if (!this.isStmtEnd() && !this.is("OP", ">") && !this.is("OP", ">>") && !this.is("OP", "|")) {
      args.push(this.parseExpr(true));
      while (this.is("OP", ",")) {
        this.next();
        this.skipNL();
        args.push(this.parseExpr(true));
      }
    }
    let redir: { op: string; target: Node } | null = null;
    if (this.is("OP", ">") || this.is("OP", ">>") || this.is("OP", "|")) {
      const op = this.next().value;
      redir = { op, target: this.parseExpr() };
    }
    return { type: kind, args, redir };
  }

  private skipNL(): void {
    while (this.is("SEMI")) this.next();
  }

  private parseIf(): Node {
    this.next();
    this.eat("OP", "(");
    const cond = this.parseExpr();
    this.eat("OP", ")");
    this.skipNL();
    const then = this.parseStmt();
    let els: Node | null = null;
    const save = this.pos;
    this.skipSemis();
    if (this.is("KEYWORD", "else")) {
      this.next();
      this.skipNL();
      els = this.parseStmt();
    } else this.pos = save;
    return { type: "if", cond, then, els };
  }

  private parseWhile(): Node {
    this.next();
    this.eat("OP", "(");
    const cond = this.parseExpr();
    this.eat("OP", ")");
    this.skipNL();
    return { type: "while", cond, body: this.parseStmt() };
  }

  private parseDoWhile(): Node {
    this.next();
    this.skipNL();
    const body = this.parseStmt();
    this.skipSemis();
    this.eat("KEYWORD", "while");
    this.eat("OP", "(");
    const cond = this.parseExpr();
    this.eat("OP", ")");
    return { type: "dowhile", cond, body };
  }

  private parseFor(): Node {
    this.next();
    this.eat("OP", "(");
    // for (k in arr)
    if (this.is("NAME") && this.peek(1).type === "KEYWORD" && this.peek(1).value === "in") {
      const v = this.next().value;
      this.next(); // in
      const arr = this.eat("NAME").value;
      this.eat("OP", ")");
      this.skipNL();
      return { type: "forin", var: v, arr, body: this.parseStmt() };
    }
    const init = this.is("SEMI") ? null : this.parseExpr();
    this.eat("SEMI");
    const cond = this.is("SEMI") ? null : this.parseExpr();
    this.eat("SEMI");
    const post = this.is("OP", ")") ? null : this.parseExpr();
    this.eat("OP", ")");
    this.skipNL();
    return { type: "for", init, cond, post, body: this.parseStmt() };
  }

  private parseExprList(): Node {
    const first = this.parseExpr();
    if (!this.is("OP", ",")) return first;
    const list = [first];
    while (this.is("OP", ",")) {
      this.next();
      list.push(this.parseExpr());
    }
    return { type: "exprlist", items: list };
  }

  // 式: 代入 (右結合)
  parseExpr(noGt = false): Node {
    return this.parseAssign(noGt);
  }
  private parseAssign(noGt: boolean): Node {
    const left = this.parseTernary(noGt);
    if (
      this.is("OP", "=") || this.is("OP", "+=") || this.is("OP", "-=") ||
      this.is("OP", "*=") || this.is("OP", "/=") || this.is("OP", "%=") || this.is("OP", "^=")
    ) {
      const op = this.next().value;
      const right = this.parseAssign(noGt);
      return { type: "assign", op, target: left, value: right };
    }
    return left;
  }
  private parseTernary(noGt: boolean): Node {
    const cond = this.parseOr(noGt);
    if (this.is("OP", "?")) {
      this.next();
      const a = this.parseAssign(noGt);
      this.eat("OP", ":");
      const b = this.parseAssign(noGt);
      return { type: "ternary", cond, a, b };
    }
    return cond;
  }
  private parseOr(noGt: boolean): Node {
    let l = this.parseAnd(noGt);
    while (this.is("OP", "||")) {
      this.next();
      this.skipNL();
      l = { type: "or", l, r: this.parseAnd(noGt) };
    }
    return l;
  }
  private parseAnd(noGt: boolean): Node {
    let l = this.parseIn(noGt);
    while (this.is("OP", "&&")) {
      this.next();
      this.skipNL();
      l = { type: "and", l, r: this.parseIn(noGt) };
    }
    return l;
  }
  private parseIn(noGt: boolean): Node {
    let l = this.parseMatch(noGt);
    while (this.is("KEYWORD", "in")) {
      this.next();
      const arr = this.eat("NAME").value;
      l = { type: "in", key: l, arr };
    }
    return l;
  }
  private parseMatch(noGt: boolean): Node {
    let l = this.parseCompare(noGt);
    while (this.is("OP", "~") || this.is("OP", "!~")) {
      const op = this.next().value;
      l = { type: "match", op, l, r: this.parseCompare(noGt) };
    }
    return l;
  }
  private parseCompare(noGt: boolean): Node {
    let l = this.parseConcat(noGt);
    while (
      this.is("OP", "<") || this.is("OP", "<=") || this.is("OP", "==") ||
      this.is("OP", "!=") || this.is("OP", ">=") || (!noGt && this.is("OP", ">"))
    ) {
      const op = this.next().value;
      l = { type: "cmp", op, l, r: this.parseConcat(noGt) };
    }
    return l;
  }
  private startsValue(): boolean {
    const t = this.peek();
    if (t.type === "NUM" || t.type === "STR" || t.type === "ERE" || t.type === "NAME" || t.type === "FUNCNAME") return true;
    if (t.type === "OP") return t.value === "(" || t.value === "$" || t.value === "!" || t.value === "++" || t.value === "--" || t.value === "-" || t.value === "+";
    return false;
  }
  private parseConcat(noGt: boolean): Node {
    let l = this.parseAdd(noGt);
    while (this.startsValue() && !this.isBinaryAhead()) {
      const r = this.parseAdd(noGt);
      l = { type: "concat", l, r };
    }
    return l;
  }
  private isBinaryAhead(): boolean {
    // 連結の継続で - + を二項演算と誤認しないよう、単項にしか使えない位置はparseAdd側が処理。
    // ここでは何もしない (startsValue が + - を含むが、実用上 concat は数値/文字列/$ で始まる)
    return false;
  }
  private parseAdd(noGt: boolean): Node {
    let l = this.parseMul(noGt);
    while (this.is("OP", "+") || this.is("OP", "-")) {
      const op = this.next().value;
      l = { type: "bin", op, l, r: this.parseMul(noGt) };
    }
    return l;
  }
  private parseMul(noGt: boolean): Node {
    let l = this.parseUnary(noGt);
    while (this.is("OP", "*") || this.is("OP", "/") || this.is("OP", "%")) {
      const op = this.next().value;
      l = { type: "bin", op, l, r: this.parseUnary(noGt) };
    }
    return l;
  }
  private parseUnary(noGt: boolean): Node {
    if (this.is("OP", "!")) {
      this.next();
      return { type: "not", e: this.parseUnary(noGt) };
    }
    if (this.is("OP", "-")) {
      this.next();
      return { type: "neg", e: this.parseUnary(noGt) };
    }
    if (this.is("OP", "+")) {
      this.next();
      return this.parseUnary(noGt);
    }
    return this.parsePow(noGt);
  }
  private parsePow(noGt: boolean): Node {
    const l = this.parsePostfix(noGt);
    if (this.is("OP", "^")) {
      this.next();
      return { type: "bin", op: "^", l, r: this.parseUnary(noGt) };
    }
    return l;
  }
  private parsePostfix(noGt: boolean): Node {
    if (this.is("OP", "++") || this.is("OP", "--")) {
      const op = this.next().value;
      return { type: "preincr", op, target: this.parsePostfix(noGt) };
    }
    let e = this.parsePrimary(noGt);
    while (this.is("OP", "++") || this.is("OP", "--")) {
      const op = this.next().value;
      e = { type: "postincr", op, target: e };
    }
    return e;
  }
  private parsePrimary(noGt: boolean): Node {
    const t = this.peek();
    if (t.type === "NUM") {
      this.next();
      return { type: "num", value: parseFloat(t.value) };
    }
    if (t.type === "STR") {
      this.next();
      return { type: "str", value: t.value };
    }
    if (t.type === "ERE") {
      this.next();
      return { type: "regex", value: t.value };
    }
    if (t.type === "OP" && t.value === "$") {
      this.next();
      return { type: "field", index: this.parsePostfix(noGt) };
    }
    if (t.type === "OP" && t.value === "(") {
      this.next();
      const e = this.parseExprList();
      this.eat("OP", ")");
      return e.type === "exprlist" ? { type: "group", e } : e;
    }
    if (t.type === "FUNCNAME") {
      this.next();
      this.eat("OP", "(");
      const args: Node[] = [];
      while (!this.is("OP", ")")) {
        args.push(this.parseExpr());
        if (this.is("OP", ",")) this.next();
      }
      this.eat("OP", ")");
      return { type: "call", name: t.value, args };
    }
    if (t.type === "NAME") {
      this.next();
      if (this.is("OP", "[")) {
        this.next();
        const index = this.parseExprList();
        this.eat("OP", "]");
        return { type: "index", name: t.value, index };
      }
      return { type: "var", name: t.value };
    }
    throw new Error(`awk: 予期しないトークン '${t.value}'`);
  }
}

// ===== 評価器 =====
class NextSignal {}
class ExitSignal {
  constructor(public code: number) {}
}
class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(public value: AwkVal) {}
}

type AwkVal = number | string;

function looksNumeric(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim()) && s.trim() !== "";
}
function toNum(v: AwkVal | undefined): number {
  if (typeof v === "number") return v;
  if (v === undefined) return 0;
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(v.trim());
  return m ? parseFloat(m[0]) : 0;
}
function numStr(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(6)));
}
function toStr(v: AwkVal | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") return numStr(v);
  return v;
}
function toBool(v: AwkVal | undefined): boolean {
  if (typeof v === "number") return v !== 0;
  if (v === undefined || v === "") return false;
  if (looksNumeric(v)) return parseFloat(v) !== 0;
  return v !== "";
}

function sprintfAwk(fmt: string, args: AwkVal[]): string {
  let ai = 0;
  return fmt.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?([diouxXeEfgGcs%])/g, (_, flags, width, prec, conv) => {
    if (conv === "%") return "%";
    let w = width === "*" ? toNum(args[ai++]) : width ? parseInt(width, 10) : 0;
    let p = prec === "*" ? toNum(args[ai++]) : prec !== undefined ? parseInt(prec, 10) : undefined;
    const a = args[ai++];
    let s: string;
    switch (conv) {
      case "d": case "i": s = String(Math.trunc(toNum(a))); break;
      case "o": s = Math.trunc(toNum(a)).toString(8); break;
      case "x": s = (Math.trunc(toNum(a)) >>> 0).toString(16); break;
      case "X": s = (Math.trunc(toNum(a)) >>> 0).toString(16).toUpperCase(); break;
      case "u": s = String(Math.trunc(toNum(a)) >>> 0); break;
      case "c": s = typeof a === "number" ? String.fromCharCode(a) : toStr(a).charAt(0); break;
      case "s": s = toStr(a); if (p !== undefined) s = s.slice(0, p); break;
      case "e": case "E": s = toNum(a).toExponential(p ?? 6); if (conv === "E") s = s.toUpperCase(); break;
      case "f": s = toNum(a).toFixed(p ?? 6); break;
      case "g": case "G": {
        const num = toNum(a);
        s = String(parseFloat(num.toPrecision(p ?? 6)));
        break;
      }
      default: s = "";
    }
    if (flags.includes("+") && /^[diouxXeEfgG]$/.test(conv) && toNum(a) >= 0) s = "+" + s;
    if (w > s.length) {
      if (flags.includes("-")) s = s.padEnd(w);
      else if (flags.includes("0") && !flags.includes("-") && /[dioxXeEfgGu]/.test(conv)) {
        const neg = s.startsWith("-") || s.startsWith("+");
        s = neg ? s[0] + s.slice(1).padStart(w - 1, "0") : s.padStart(w, "0");
      } else s = s.padStart(w);
    }
    return s;
  });
}

interface AwkContext {
  out: (s: string) => void;
  fileWrite: (path: string, data: string, append: boolean) => void;
}

class Interp {
  globals = new Map<string, AwkVal>();
  arrays = new Map<string, Map<string, AwkVal>>();
  locals: Array<Map<string, AwkVal | Map<string, AwkVal>>> = [];
  fields: string[] = [];
  record = "";
  nf = 0;
  nr = 0;
  exitCode = 0;
  reCache = new Map<string, RegExp>();

  constructor(
    private functions: Map<string, { params: string[]; body: Node[] }>,
    private ctx: AwkContext,
  ) {
    this.globals.set("FS", " ");
    this.globals.set("OFS", " ");
    this.globals.set("ORS", "\n");
    this.globals.set("RS", "\n");
    this.globals.set("SUBSEP", "\x1c");
    this.globals.set("FILENAME", "");
  }

  private re(src: string, ic = false, global = false): RegExp {
    const key = (global ? "g:" : "") + (ic ? "i:" : "") + src;
    let r = this.reCache.get(key);
    if (!r) {
      r = new RegExp(src, (global ? "g" : "") + (ic ? "i" : ""));
      this.reCache.set(key, r);
    }
    return r;
  }

  setRecord(s: string): void {
    this.record = s;
    this.splitRecord();
  }
  private splitRecord(): void {
    const fs = toStr(this.globals.get("FS"));
    let parts: string[];
    if (this.record === "") parts = [];
    else if (fs === " ") parts = this.record.replace(/^[ \t\n]+|[ \t\n]+$/g, "").split(/[ \t\n]+/).filter((x) => x !== "" || this.record.trim() !== "");
    else if (fs.length === 1) parts = this.record.split(fs);
    else parts = this.record.split(new RegExp(fs));
    if (this.record === "") parts = [];
    this.fields = parts;
    this.nf = parts.length;
  }
  private rebuildRecord(): void {
    const ofs = toStr(this.globals.get("OFS"));
    this.record = this.fields.join(ofs);
  }
  getField(i: number): AwkVal {
    if (i === 0) return this.record;
    return this.fields[i - 1] ?? "";
  }
  setField(i: number, v: AwkVal): void {
    if (i === 0) {
      this.setRecord(toStr(v));
      return;
    }
    while (this.fields.length < i) this.fields.push("");
    this.fields[i - 1] = toStr(v);
    this.nf = Math.max(this.nf, i);
    this.rebuildRecord();
  }

  getVar(name: string): AwkVal {
    for (let k = this.locals.length - 1; k >= 0; k--) {
      if (this.locals[k].has(name)) {
        const v = this.locals[k].get(name);
        return typeof v === "object" ? "" : (v ?? "");
      }
    }
    if (name === "NF") return this.nf;
    if (name === "NR") return this.nr;
    if (name === "FNR") return this.nr;
    return this.globals.get(name) ?? "";
  }
  setVar(name: string, v: AwkVal): void {
    for (let k = this.locals.length - 1; k >= 0; k--) {
      if (this.locals[k].has(name)) {
        this.locals[k].set(name, v);
        return;
      }
    }
    if (name === "NF") {
      const newNf = Math.trunc(toNum(v));
      if (newNf < this.nf) this.fields = this.fields.slice(0, newNf);
      else while (this.fields.length < newNf) this.fields.push("");
      this.nf = newNf;
      this.rebuildRecord();
      return;
    }
    if (name === "NR" || name === "FNR") {
      this.nr = Math.trunc(toNum(v));
      return;
    }
    this.globals.set(name, v);
  }

  getArray(name: string): Map<string, AwkVal> {
    for (let k = this.locals.length - 1; k >= 0; k--) {
      const lv = this.locals[k].get(name);
      if (lv instanceof Map) return lv;
    }
    let a = this.arrays.get(name);
    if (!a) {
      a = new Map();
      this.arrays.set(name, a);
    }
    return a;
  }

  run(rules: Rule[], lines: string[], filename: string): void {
    this.globals.set("FILENAME", filename);
    try {
      for (const r of rules) if (r.kind === "BEGIN") this.execStmts(r.action ?? []);
      const mains = rules.filter((r) => r.kind === "main");
      const hasMainOrEnd = rules.some((r) => r.kind === "main" || r.kind === "END");
      if (hasMainOrEnd) {
        for (const line of lines) {
          this.nr++;
          this.setRecord(line);
          try {
            for (const r of mains) this.runMain(r);
          } catch (e) {
            if (e instanceof NextSignal) continue;
            throw e;
          }
        }
      }
      for (const r of rules) if (r.kind === "END") this.execStmts(r.action ?? []);
    } catch (e) {
      if (e instanceof ExitSignal) {
        this.exitCode = e.code;
        // END は exit 後も実行されるべきだが簡略化
      } else throw e;
    }
  }

  private runMain(r: Rule): void {
    let matched: boolean;
    if (!r.pattern) matched = true;
    else if (r.pattern2) {
      if (!r.rangeActive) {
        if (toBool(this.eval(r.pattern))) {
          r.rangeActive = true;
          matched = true;
          if (toBool(this.eval(r.pattern2))) r.rangeActive = false;
        } else matched = false;
      } else {
        matched = true;
        if (toBool(this.eval(r.pattern2))) r.rangeActive = false;
      }
    } else matched = toBool(this.eval(r.pattern));
    if (!matched) return;
    if (r.action) this.execStmts(r.action);
    else this.ctx.out(this.record + toStr(this.globals.get("ORS")));
  }

  private execStmts(stmts: Node[]): void {
    for (const s of stmts) this.execStmt(s);
  }

  private execStmt(s: Node): void {
    switch (s.type) {
      case "block":
        this.execStmts(s.body);
        return;
      case "exprstmt":
        this.eval(s.expr);
        return;
      case "print": {
        const ofs = toStr(this.globals.get("OFS"));
        const ors = toStr(this.globals.get("ORS"));
        const text =
          (s.args.length === 0 ? this.record : s.args.map((a: Node) => this.toOutStr(this.eval(a))).join(ofs)) + ors;
        this.output(text, s.redir);
        return;
      }
      case "printf": {
        const vals = s.args.map((a: Node) => this.eval(a));
        const fmt = toStr(vals[0]);
        this.output(sprintfAwk(fmt, vals.slice(1)), s.redir);
        return;
      }
      case "if":
        if (toBool(this.eval(s.cond))) this.execStmt(s.then);
        else if (s.els) this.execStmt(s.els);
        return;
      case "while":
        while (toBool(this.eval(s.cond))) {
          try {
            this.execStmt(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      case "dowhile":
        do {
          try {
            this.execStmt(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        } while (toBool(this.eval(s.cond)));
        return;
      case "for":
        if (s.init) this.eval(s.init);
        while (s.cond === null || toBool(this.eval(s.cond))) {
          try {
            this.execStmt(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) {
              if (s.post) this.eval(s.post);
              continue;
            }
            throw e;
          }
          if (s.post) this.eval(s.post);
        }
        return;
      case "forin": {
        const arr = this.getArray(s.arr);
        for (const key of [...arr.keys()]) {
          this.setVar(s.var, key);
          try {
            this.execStmt(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "next":
        throw new NextSignal();
      case "exit":
        throw new ExitSignal(s.arg ? Math.trunc(toNum(this.eval(s.arg))) : this.exitCode);
      case "return":
        throw new ReturnSignal(s.arg ? this.eval(s.arg) : "");
      case "break":
        throw new BreakSignal();
      case "continue":
        throw new ContinueSignal();
      case "delete": {
        const arr = this.getArray(s.name);
        if (s.index) arr.delete(this.indexKey(s.index));
        else arr.clear();
        return;
      }
    }
  }

  private toOutStr(v: AwkVal): string {
    return toStr(v);
  }
  private output(text: string, redir: { op: string; target: Node } | null): void {
    if (!redir) {
      this.ctx.out(text);
      return;
    }
    const target = toStr(this.eval(redir.target));
    if (redir.op === ">" || redir.op === ">>") this.ctx.fileWrite(target, text, redir.op === ">>");
    else this.ctx.out(text); // パイプは簡略化 (そのまま出力)
  }

  private indexKey(index: Node): string {
    const subsep = toStr(this.globals.get("SUBSEP"));
    if (index.type === "exprlist") return index.items.map((it: Node) => toStr(this.eval(it))).join(subsep);
    return toStr(this.eval(index));
  }

  eval(n: Node): AwkVal {
    switch (n.type) {
      case "num":
        return n.value;
      case "str":
        return n.value;
      case "regex":
        return this.re(n.value).test(this.record) ? 1 : 0;
      case "var":
        return this.getVar(n.name);
      case "field":
        return this.getField(Math.trunc(toNum(this.eval(n.index))));
      case "index": {
        const arr = this.getArray(n.name);
        const key = this.indexKey(n.index);
        if (!arr.has(key)) arr.set(key, "");
        return arr.get(key) ?? "";
      }
      case "group":
        return this.eval(n.e.items[n.e.items.length - 1]);
      case "assign":
        return this.evalAssign(n);
      case "ternary":
        return toBool(this.eval(n.cond)) ? this.eval(n.a) : this.eval(n.b);
      case "or":
        return toBool(this.eval(n.l)) || toBool(this.eval(n.r)) ? 1 : 0;
      case "and":
        return toBool(this.eval(n.l)) && toBool(this.eval(n.r)) ? 1 : 0;
      case "not":
        return toBool(this.eval(n.e)) ? 0 : 1;
      case "neg":
        return -toNum(this.eval(n.e));
      case "in": {
        const arr = this.getArray(n.arr);
        return arr.has(this.indexKey(n.key)) ? 1 : 0;
      }
      case "match": {
        const s = toStr(this.eval(n.l));
        const re = n.r.type === "regex" ? this.re(n.r.value) : this.re(toStr(this.eval(n.r)));
        const m = re.test(s);
        return n.op === "~" ? (m ? 1 : 0) : m ? 0 : 1;
      }
      case "cmp":
        return this.evalCmp(n);
      case "concat":
        return toStr(this.eval(n.l)) + toStr(this.eval(n.r));
      case "bin":
        return this.evalBin(n);
      case "preincr": {
        const cur = toNum(this.evalRef(n.target).get());
        const nv = cur + (n.op === "++" ? 1 : -1);
        this.evalRef(n.target).set(nv);
        return nv;
      }
      case "postincr": {
        const ref = this.evalRef(n.target);
        const cur = toNum(ref.get());
        ref.set(cur + (n.op === "++" ? 1 : -1));
        return cur;
      }
      case "call":
        return this.evalCall(n);
    }
    return "";
  }

  private evalCmp(n: Node): AwkVal {
    const a = this.eval(n.l);
    const b = this.eval(n.r);
    let r: number;
    const an = typeof a === "number" || looksNumeric(toStr(a));
    const bn = typeof b === "number" || looksNumeric(toStr(b));
    if (an && bn) r = toNum(a) - toNum(b);
    else {
      const sa = toStr(a);
      const sb = toStr(b);
      r = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    switch (n.op) {
      case "<": return r < 0 ? 1 : 0;
      case "<=": return r <= 0 ? 1 : 0;
      case ">": return r > 0 ? 1 : 0;
      case ">=": return r >= 0 ? 1 : 0;
      case "==": return r === 0 ? 1 : 0;
      case "!=": return r !== 0 ? 1 : 0;
    }
    return 0;
  }
  private evalBin(n: Node): AwkVal {
    const a = toNum(this.eval(n.l));
    const b = toNum(this.eval(n.r));
    switch (n.op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return a / b;
      case "%": return a % b;
      case "^": return Math.pow(a, b);
    }
    return 0;
  }
  private evalAssign(n: Node): AwkVal {
    const ref = this.evalRef(n.target);
    let v: AwkVal;
    if (n.op === "=") v = this.eval(n.value);
    else {
      const cur = toNum(ref.get());
      const rhs = toNum(this.eval(n.value));
      switch (n.op) {
        case "+=": v = cur + rhs; break;
        case "-=": v = cur - rhs; break;
        case "*=": v = cur * rhs; break;
        case "/=": v = cur / rhs; break;
        case "%=": v = cur % rhs; break;
        case "^=": v = Math.pow(cur, rhs); break;
        default: v = rhs;
      }
    }
    ref.set(v);
    return v;
  }
  private evalRef(n: Node): { get: () => AwkVal; set: (v: AwkVal) => void } {
    if (n.type === "var") return { get: () => this.getVar(n.name), set: (v) => this.setVar(n.name, v) };
    if (n.type === "field") {
      const i = Math.trunc(toNum(this.eval(n.index)));
      return { get: () => this.getField(i), set: (v) => this.setField(i, v) };
    }
    if (n.type === "index") {
      const arr = this.getArray(n.name);
      const key = this.indexKey(n.index);
      return { get: () => arr.get(key) ?? "", set: (v) => arr.set(key, v) };
    }
    return { get: () => "", set: () => {} };
  }

  private evalCall(n: Node): AwkVal {
    const name = n.name;
    const A = n.args as Node[];
    const arg = (i: number): AwkVal => (i < A.length ? this.eval(A[i]) : "");
    switch (name) {
      case "length": {
        if (A.length === 0) return this.record.length;
        if (A[0].type === "var" && this.arrays.has(A[0].name)) return this.getArray(A[0].name).size;
        return toStr(arg(0)).length;
      }
      case "substr": {
        const s = toStr(arg(0));
        let start = Math.trunc(toNum(arg(1)));
        const len = A.length >= 3 ? Math.trunc(toNum(arg(2))) : Infinity;
        if (start < 1) start = 1;
        return s.substr(start - 1, len);
      }
      case "index":
        return toStr(arg(0)).indexOf(toStr(arg(1))) + 1;
      case "toupper":
        return toStr(arg(0)).toUpperCase();
      case "tolower":
        return toStr(arg(0)).toLowerCase();
      case "int":
        return Math.trunc(toNum(arg(0)));
      case "sqrt":
        return Math.sqrt(toNum(arg(0)));
      case "exp":
        return Math.exp(toNum(arg(0)));
      case "log":
        return Math.log(toNum(arg(0)));
      case "sin":
        return Math.sin(toNum(arg(0)));
      case "cos":
        return Math.cos(toNum(arg(0)));
      case "atan2":
        return Math.atan2(toNum(arg(0)), toNum(arg(1)));
      case "rand":
        return Math.random();
      case "srand":
        return 0;
      case "sprintf":
        return sprintfAwk(toStr(arg(0)), A.slice(1).map((a) => this.eval(a)));
      case "split": {
        const s = toStr(arg(0));
        const arrName = (A[1] as Node).name;
        const arr = this.getArray(arrName);
        arr.clear();
        const fsArg = A.length >= 3 ? (A[2].type === "regex" ? A[2].value : toStr(this.eval(A[2]))) : toStr(this.globals.get("FS"));
        let parts: string[];
        if (s === "") parts = [];
        else if (fsArg === " ") parts = s.trim().split(/[ \t\n]+/).filter(Boolean);
        else if (fsArg.length === 1) parts = s.split(fsArg);
        else parts = s.split(new RegExp(fsArg));
        parts.forEach((p, i) => arr.set(String(i + 1), p));
        return parts.length;
      }
      case "sub":
      case "gsub": {
        const reNode = A[0];
        const re = reNode.type === "regex" ? this.re(reNode.value, false, true) : this.re(toStr(this.eval(reNode)), false, true);
        const repl = toStr(arg(1));
        const targetRef = A.length >= 3 ? this.evalRef(A[2]) : this.evalRef({ type: "field", index: { type: "num", value: 0 } });
        const orig = toStr(targetRef.get());
        let count = 0;
        const global = name === "gsub";
        re.lastIndex = 0;
        const result = orig.replace(re, (m) => {
          if (!global && count >= 1) return m;
          count++;
          return repl.replace(/\\?&/g, (x) => (x === "\\&" ? "&" : m)).replace(/\\(\d)/g, "");
        });
        if (count > 0) targetRef.set(result);
        return count;
      }
      case "match": {
        const s = toStr(arg(0));
        const re = A[1].type === "regex" ? this.re(A[1].value) : this.re(toStr(this.eval(A[1])));
        re.lastIndex = 0;
        const m = re.exec(s);
        if (m) {
          this.globals.set("RSTART", m.index + 1);
          this.globals.set("RLENGTH", m[0].length);
          return m.index + 1;
        }
        this.globals.set("RSTART", 0);
        this.globals.set("RLENGTH", -1);
        return 0;
      }
      case "system":
        return 0;
      default: {
        const fn = this.functions.get(name);
        if (fn) return this.callUser(fn, A);
        return "";
      }
    }
  }

  private callUser(fn: { params: string[]; body: Node[] }, args: Node[]): AwkVal {
    const frame = new Map<string, AwkVal | Map<string, AwkVal>>();
    fn.params.forEach((p, i) => {
      if (i < args.length) {
        const a = args[i];
        if (a.type === "var" && (this.arrays.has(a.name) || !this.hasScalar(a.name))) {
          // 配列渡し (参照)
          if (this.arrays.has(a.name)) {
            frame.set(p, this.getArray(a.name));
            return;
          }
        }
        frame.set(p, this.eval(a));
      } else frame.set(p, "");
    });
    this.locals.push(frame);
    try {
      this.execStmts(fn.body);
      return "";
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.locals.pop();
    }
  }
  private hasScalar(name: string): boolean {
    return this.globals.has(name);
  }
}

export const awk: Command = {
  name: "awk",
  summary: "パターン処理言語 (フィールド/集計/正規表現)",
  run(ctx: ExecContext) {
    const args = ctx.args;
    const assigns: Array<[string, string]> = [];
    let fs: string | null = null;
    let program: string | null = null;
    const files: string[] = [];
    let i = 1;
    while (i < args.length) {
      const a = args[i];
      if (a === "--") {
        i++;
        break;
      }
      if (a === "-F") {
        fs = args[++i] ?? " ";
      } else if (a.startsWith("-F")) {
        fs = a.slice(2);
      } else if (a === "-v") {
        const kv = args[++i] ?? "";
        const eq = kv.indexOf("=");
        if (eq >= 0) assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
      } else if (a.startsWith("-v")) {
        const kv = a.slice(2);
        const eq = kv.indexOf("=");
        if (eq >= 0) assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
      } else if (a === "-f") {
        const node = ctx.vfs.stat(ctx.resolve(args[++i] ?? ""));
        program = (program ?? "") + (node && node.type === "file" ? node.content : "");
      } else if (a.startsWith("-") && a !== "-" && a.length > 1) {
        // 無視
      } else if (program === null) {
        program = a;
      } else files.push(a);
      i++;
    }
    for (; i < args.length; i++) {
      if (program === null) program = args[i];
      else files.push(args[i]);
    }

    if (program === null) {
      ctx.err("usage: awk [-F fs] [-v var=val] 'program' [file ...]\n");
      return 2;
    }

    let rules: Rule[];
    let functions: Map<string, { params: string[]; body: Node[] }>;
    try {
      const parser = new Parser(lex(program));
      rules = parser.parseProgram();
      functions = parser.functions;
    } catch (e) {
      ctx.err((e as Error).message + "\n");
      return 2;
    }

    const fsUnescape = (s: string): string => s.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
    const opened = new Set<string>(); // `>` で既に truncate 済みのパス
    const actx: AwkContext = {
      out: (s) => ctx.out(s),
      fileWrite: (path, data, append) => {
        const abs = ctx.resolve(path);
        const doAppend = append || opened.has(abs);
        opened.add(abs);
        const node = ctx.vfs.stat(abs);
        if (node && node.type === "file") {
          node.content = doAppend ? node.content + data : data;
          node.mtime = new Date();
        } else ctx.vfs.createFile(abs, data);
      },
    };

    const interp = new Interp(functions, actx);
    if (fs !== null) interp.globals.set("FS", fsUnescape(fs));
    for (const [k, v] of assigns) interp.setVar(k, looksNumeric(v) ? parseFloat(v) : v);

    // 入力
    const gather = (content: string): string[] => {
      const endsNL = content.endsWith("\n");
      const lines = content.split("\n");
      if (endsNL) lines.pop();
      return lines;
    };

    try {
      if (files.length === 0) {
        interp.run(rules, gather(ctx.stdin), "");
      } else {
        const allLines: string[] = [];
        let fname = "";
        for (const f of files) {
          if (f === "-") {
            allLines.push(...gather(ctx.stdin));
            continue;
          }
          const node = ctx.vfs.stat(ctx.resolve(f));
          if (!node || node.type !== "file") {
            ctx.err(`awk: can't open file ${f}\n`);
            continue;
          }
          fname = f;
          allLines.push(...gather(node.content));
        }
        interp.run(rules, allLines, fname);
      }
    } catch (e) {
      ctx.err(`awk: ${(e as Error).message}\n`);
      return 2;
    }
    return interp.exitCode;
  },
};
