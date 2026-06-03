import type { Command, ExecContext } from "../types";
import { type VNode } from "../../vfs/VFS";
import { makeRegex } from "../regex";

const UNARY = new Set([
  "-e", "-f", "-d", "-r", "-w", "-x", "-s", "-L", "-h", "-b", "-c", "-p",
  "-S", "-k", "-u", "-g", "-O", "-G", "-N", "-t", "-z", "-n", "-v",
]);
const BINARY = new Set([
  "=", "==", "!=", "<", ">", "=~", "-eq", "-ne", "-lt", "-le", "-gt", "-ge", "-nt", "-ot", "-ef",
]);

function permBits(node: VNode, user: string): number {
  if (node.owner === user) return (node.mode >> 6) & 7;
  if (node.group === user || node.group === "guest") return (node.mode >> 3) & 7;
  return node.mode & 7;
}

function caseGlob(s: string, pattern: string): boolean {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close < 0) re += "\\[";
      else {
        let inner = pattern.slice(i + 1, close);
        let neg = false;
        if (inner.startsWith("!") || inner.startsWith("^")) {
          neg = true;
          inner = inner.slice(1);
        }
        re += "[" + (neg ? "^" : "") + inner.replace(/\\/g, "\\\\") + "]";
        i = close;
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  re += "$";
  try {
    return new RegExp(re).test(s);
  } catch {
    return s === pattern;
  }
}

function evalTest(tokens: string[], ctx: ExecContext, bracket2: boolean): boolean {
  let pos = 0;
  const atEnd = (): boolean => pos >= tokens.length;
  const peek = (): string => tokens[pos];

  const fileNode = (p: string): VNode | null => ctx.vfs.stat(ctx.resolve(p));
  const lstatNode = (p: string): VNode | null => ctx.vfs.lstat(ctx.resolve(p));

  const unary = (op: string, arg: string): boolean => {
    switch (op) {
      case "-e": return fileNode(arg) != null;
      case "-f": return fileNode(arg)?.type === "file";
      case "-d": return fileNode(arg)?.type === "dir";
      case "-L": case "-h": return lstatNode(arg)?.type === "symlink";
      case "-s": {
        const n = fileNode(arg);
        return !!n && n.type === "file" && n.content.length > 0;
      }
      case "-r": {
        const n = fileNode(arg);
        return !!n && (permBits(n, ctx.env.user) & 4) !== 0;
      }
      case "-w": {
        const n = fileNode(arg);
        return !!n && (permBits(n, ctx.env.user) & 2) !== 0;
      }
      case "-x": {
        const n = fileNode(arg);
        return !!n && (permBits(n, ctx.env.user) & 1) !== 0;
      }
      case "-O": return fileNode(arg)?.owner === ctx.env.user;
      case "-G": return fileNode(arg)?.group === ctx.env.user || fileNode(arg)?.group === "guest";
      case "-z": return arg === "";
      case "-n": return arg !== "";
      case "-v": return ctx.env.has(arg);
      case "-t": return false;
      default: return fileNode(arg) != null; // -b -c -p -S -k -u -g -N 等は存在判定で代用
    }
  };

  const binary = (a: string, op: string, b: string): boolean => {
    switch (op) {
      case "=": case "==": return bracket2 ? caseGlob(a, b) : a === b;
      case "!=": return bracket2 ? !caseGlob(a, b) : a !== b;
      case "<": return a < b;
      case ">": return a > b;
      case "=~": {
        try {
          return makeRegex(b, { extended: true }).test(a);
        } catch {
          return false;
        }
      }
      case "-eq": return parseInt(a, 10) === parseInt(b, 10);
      case "-ne": return parseInt(a, 10) !== parseInt(b, 10);
      case "-lt": return parseInt(a, 10) < parseInt(b, 10);
      case "-le": return parseInt(a, 10) <= parseInt(b, 10);
      case "-gt": return parseInt(a, 10) > parseInt(b, 10);
      case "-ge": return parseInt(a, 10) >= parseInt(b, 10);
      case "-nt": return (fileNode(a)?.mtime.getTime() ?? 0) > (fileNode(b)?.mtime.getTime() ?? 0);
      case "-ot": return (fileNode(a)?.mtime.getTime() ?? 0) < (fileNode(b)?.mtime.getTime() ?? 0);
      case "-ef": return ctx.vfs.stat(ctx.resolve(a)) === ctx.vfs.stat(ctx.resolve(b));
      default: return false;
    }
  };

  function parsePrimary(): boolean {
    if (peek() === "(") {
      pos++;
      const v = parseExpr();
      if (peek() === ")") pos++;
      return v;
    }
    const tok = peek();
    // 単項
    if (UNARY.has(tok) && pos + 1 < tokens.length) {
      pos += 2;
      return unary(tok, tokens[pos - 1]);
    }
    // 二項
    if (pos + 2 < tokens.length + 1 && BINARY.has(tokens[pos + 1] ?? "")) {
      const a = tokens[pos];
      const op = tokens[pos + 1];
      const b = tokens[pos + 2] ?? "";
      pos += 3;
      return binary(a, op, b);
    }
    // 単一文字列 (非空なら真)
    pos++;
    return tok !== undefined && tok !== "";
  }
  function parseNot(): boolean {
    if (!atEnd() && peek() === "!") {
      pos++;
      return !parseNot();
    }
    return parsePrimary();
  }
  function parseAnd(): boolean {
    let left = parseNot();
    while (!atEnd() && (peek() === "-a" || (bracket2 && peek() === "&&"))) {
      pos++;
      const right = parseNot();
      left = left && right;
    }
    return left;
  }
  function parseExpr(): boolean {
    let left = parseAnd();
    while (!atEnd() && (peek() === "-o" || (bracket2 && peek() === "||"))) {
      pos++;
      const right = parseAnd();
      left = left || right;
    }
    return left;
  }

  if (tokens.length === 0) return false;
  return parseExpr();
}

const testCmd: Command = {
  name: "test",
  summary: "条件式を評価 (ファイル/文字列/数値)",
  run(ctx) {
    const name = ctx.args[0];
    let tokens = ctx.args.slice(1);
    let bracket2 = false;
    if (name === "[") {
      if (tokens[tokens.length - 1] === "]") tokens = tokens.slice(0, -1);
      else {
        ctx.err("[: missing `]'\n");
        return 2;
      }
    } else if (name === "[[") {
      bracket2 = true;
      if (tokens[tokens.length - 1] === "]]") tokens = tokens.slice(0, -1);
      else {
        ctx.err("[[: missing `]]'\n");
        return 2;
      }
    }
    try {
      return evalTest(tokens, ctx, bracket2) ? 0 : 1;
    } catch {
      return 2;
    }
  },
};

const bracket: Command = { name: "[", summary: "test と同じ (末尾に ] が必要)", run: testCmd.run };
const bracket2Cmd: Command = { name: "[[", summary: "拡張テスト (=~ /パターン/ && ||)", run: testCmd.run };

export const scriptingCommands: Command[] = [testCmd, bracket, bracket2Cmd];
