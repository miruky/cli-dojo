import type { Environment } from "./Environment";
import type { VFS } from "../vfs/VFS";
import { globExpand } from "./glob";
import { evalArith } from "./arith";
import type { Frag, Word } from "./parser";

export interface ExpandCtx {
  env: Environment;
  vfs: VFS;
  /** コマンド置換 $(...) / `...` の実行。stdout を返す。 */
  runSub: (command: string) => string;
}

/** ${var} の対応する閉じ波括弧の位置 (ネスト対応)。 */
function findCloseBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** glob パターン (* ? [..]) を RegExp ソースへ変換。greedy=false で最短一致。 */
function globToRegExp(pat: string, greedy: boolean): string {
  const star = greedy ? "[\\s\\S]*" : "[\\s\\S]*?";
  const esc = (ch: string): string => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re = "";
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === "*") re += star;
    else if (c === "?") re += "[\\s\\S]";
    else if (c === "[") {
      let j = i + 1;
      let neg = false;
      let cls = "";
      if (pat[j] === "!" || pat[j] === "^") {
        neg = true;
        j++;
      }
      while (j < pat.length && pat[j] !== "]") {
        cls += pat[j].replace(/[\\\]]/g, "\\$&");
        j++;
      }
      if (pat[j] === "]") {
        re += "[" + (neg ? "^" : "") + cls + "]";
        i = j;
      } else re += "\\[";
    } else if (c === "\\") {
      const n = pat[i + 1];
      if (n) {
        re += esc(n);
        i++;
      } else re += "\\\\";
    } else re += esc(c);
  }
  return re;
}

function stripPrefix(val: string, pat: string, longest: boolean): string {
  if (pat === "") return val;
  let re: RegExp;
  try {
    re = new RegExp("^(?:" + globToRegExp(pat, true) + ")$");
  } catch {
    return val;
  }
  if (longest) {
    for (let i = val.length; i >= 0; i--) if (re.test(val.slice(0, i))) return val.slice(i);
  } else {
    for (let i = 0; i <= val.length; i++) if (re.test(val.slice(0, i))) return val.slice(i);
  }
  return val;
}

function stripSuffix(val: string, pat: string, longest: boolean): string {
  if (pat === "") return val;
  let re: RegExp;
  try {
    re = new RegExp("^(?:" + globToRegExp(pat, true) + ")$");
  } catch {
    return val;
  }
  if (longest) {
    for (let i = 0; i <= val.length; i++) if (re.test(val.slice(i))) return val.slice(0, i);
  } else {
    for (let i = val.length; i >= 0; i--) if (re.test(val.slice(i))) return val.slice(0, i);
  }
  return val;
}

function replaceParam(val: string, spec: string, exp: (s: string) => string): string {
  let all = false;
  let aStart = false;
  let aEnd = false;
  if (spec[0] === "/") {
    all = true;
    spec = spec.slice(1);
  } else if (spec[0] === "#") {
    aStart = true;
    spec = spec.slice(1);
  } else if (spec[0] === "%") {
    aEnd = true;
    spec = spec.slice(1);
  }
  const idx = spec.indexOf("/");
  let pat = idx >= 0 ? spec.slice(0, idx) : spec;
  let repl = idx >= 0 ? spec.slice(idx + 1) : "";
  pat = exp(pat);
  repl = exp(repl);
  if (pat === "") return val;
  let src = globToRegExp(pat, true);
  if (aStart) src = "^(?:" + src + ")";
  else if (aEnd) src = "(?:" + src + ")$";
  let re: RegExp;
  try {
    re = new RegExp(src, all ? "g" : "");
  } catch {
    return val;
  }
  return val.replace(re, repl.replace(/\$/g, "$$$$"));
}

/** ${...} の中身を bash 風パラメータ展開で評価。 */
function expandParam(inner: string, env: Environment): string {
  if (inner === "") return "";
  const exp = (s: string): string => expandVars(s, env);
  // ${#var} 長さ
  if (inner[0] === "#" && inner.length > 1 && inner !== "#") {
    const nm = inner.slice(1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm) || /^[0-9]+$/.test(nm) || "@*".includes(nm)) {
      return String((env.get(nm) ?? "").length);
    }
  }
  const mName = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?@*#$!])/.exec(inner);
  const name = mName ? mName[1] : inner;
  const rest = mName ? inner.slice(name.length) : "";
  const defined = env.get(name) !== undefined;
  const val = env.get(name) ?? "";
  const hasVal = (colon: boolean): boolean => (colon ? defined && val !== "" : defined);

  if (rest === "") return val;

  let m: RegExpExecArray | null;
  if ((m = /^(:?)([-+=?])([\s\S]*)$/.exec(rest))) {
    const colon = m[1] === ":";
    const op = m[2];
    const word = exp(m[3]);
    const ok = hasVal(colon);
    if (op === "-") return ok ? val : word;
    if (op === "+") return ok ? word : "";
    if (op === "=") {
      if (!ok) {
        env.set(name, word);
        return word;
      }
      return val;
    }
    return ok ? val : ""; // :? エラーは抑制
  }
  if (rest[0] === ":") {
    const spec = rest.slice(1).trim();
    const parts = spec.split(":");
    let off = parseInt(parts[0], 10);
    if (!Number.isFinite(off)) off = 0;
    if (off < 0) off = Math.max(0, val.length + off);
    let res = val.slice(off);
    if (parts.length > 1) {
      const len = parseInt(parts[1], 10) || 0;
      res = len < 0 ? res.slice(0, Math.max(0, res.length + len)) : res.slice(0, len);
    }
    return res;
  }
  if (rest[0] === "#") {
    const longest = rest[1] === "#";
    return stripPrefix(val, exp(rest.slice(longest ? 2 : 1)), longest);
  }
  if (rest[0] === "%") {
    const longest = rest[1] === "%";
    return stripSuffix(val, exp(rest.slice(longest ? 2 : 1)), longest);
  }
  if (rest[0] === "/") return replaceParam(val, rest.slice(1), exp);
  if (rest[0] === "^") {
    return rest[1] === "^" ? val.toUpperCase() : val.charAt(0).toUpperCase() + val.slice(1);
  }
  if (rest[0] === ",") {
    return rest[1] === "," ? val.toLowerCase() : val.charAt(0).toLowerCase() + val.slice(1);
  }
  return val;
}

/** $VAR / ${VAR} / $? / $$ / $0 を展開 (クォート除去後の文字列に対して)。 */
export function expandVars(text: string, env: Environment): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "$") {
      const nx = text[i + 1];
      if (nx === "{") {
        const end = findCloseBrace(text, i + 1);
        if (end >= 0) {
          out += expandParam(text.slice(i + 2, end), env);
          i = end + 1;
          continue;
        }
      }
      if (nx === "?" || nx === "$" || nx === "0" || nx === "@" || nx === "*" || nx === "#") {
        out += env.get(nx) ?? "";
        i += 2;
        continue;
      }
      if (nx >= "1" && nx <= "9") {
        out += env.get(nx) ?? "";
        i += 2;
        continue;
      }
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1));
      if (m) {
        out += env.get(m[0]) ?? "";
        i += 1 + m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function tildeExpand(text: string, env: Environment): string {
  if (text === "~" || text.startsWith("~/")) {
    return (env.get("HOME") ?? "/root") + text.slice(1);
  }
  return text;
}

// ---- ブレース展開 ----
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopCommas(inner: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let found = false;
  for (const c of inner) {
    if (c === "{") {
      depth++;
      cur += c;
    } else if (c === "}") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      found = true;
    } else cur += c;
  }
  parts.push(cur);
  return found ? parts : null;
}

function parseSequence(inner: string): string[] | null {
  const num = /^(-?\d+)\.\.(-?\d+)(?:\.\.(\d+))?$/.exec(inner);
  if (num) {
    const a = parseInt(num[1], 10);
    const b = parseInt(num[2], 10);
    const step = num[3] ? Math.max(1, parseInt(num[3], 10)) : 1;
    const out: string[] = [];
    if (a <= b) for (let x = a; x <= b; x += step) out.push(String(x));
    else for (let x = a; x >= b; x -= step) out.push(String(x));
    return out;
  }
  const ch = /^([A-Za-z])\.\.([A-Za-z])$/.exec(inner);
  if (ch) {
    const a = inner.charCodeAt(0);
    const b = inner.charCodeAt(3);
    const out: string[] = [];
    if (a <= b) for (let x = a; x <= b; x++) out.push(String.fromCharCode(x));
    else for (let x = a; x >= b; x--) out.push(String.fromCharCode(x));
    return out;
  }
  return null;
}

function braceExpand(text: string): string[] {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      const close = matchBrace(text, i);
      if (close < 0) continue;
      const inner = text.slice(i + 1, close);
      const items = splitTopCommas(inner) ?? parseSequence(inner);
      if (!items) continue;
      const pre = text.slice(0, i);
      const post = text.slice(close + 1);
      const out: string[] = [];
      for (const it of items) {
        for (const e of braceExpand(it)) {
          for (const t of braceExpand(post)) out.push(pre + e + t);
        }
      }
      return out;
    }
  }
  return [text];
}

// ---- 語の展開 ----
interface FChar {
  c: string;
  glob: boolean;
}

function expandVariant(word: Word, ctx: ExpandCtx): string[] {
  const fields: Array<{ chars: FChar[]; quoted: boolean }> = [];
  let cur: { chars: FChar[]; quoted: boolean } = { chars: [], quoted: false };
  const flush = (): void => {
    fields.push(cur);
    cur = { chars: [], quoted: false };
  };
  const addQuoted = (s: string): void => {
    cur.quoted = true;
    for (const ch of s) cur.chars.push({ c: ch, glob: false });
  };
  const addSplit = (s: string, glob: boolean): void => {
    const tokens = s.split(/[ \t\n]+/);
    for (let i = 0; i < tokens.length; i++) {
      if (i > 0) flush();
      for (const ch of tokens[i]) cur.chars.push({ c: ch, glob });
    }
  };

  let first = true;
  for (const frag of word) {
    if (frag.kind === "lit") {
      if (frag.quote === "single") addQuoted(frag.text);
      else if (frag.quote === "double") addQuoted(expandVars(frag.text, ctx.env));
      else {
        let t = frag.text;
        if (first) t = tildeExpand(t, ctx.env);
        t = expandVars(t, ctx.env);
        addSplit(t, true);
      }
    } else {
      const trimmed = frag.command.trim();
      const output =
        trimmed.startsWith("(") && trimmed.endsWith(")")
          ? String(evalArith(trimmed.slice(1, -1), ctx.env))
          : ctx.runSub(frag.command).replace(/\n+$/, "");
      if (frag.quote === "double") addQuoted(output);
      else addSplit(output, true);
    }
    first = false;
  }
  flush();

  const result: string[] = [];
  for (const field of fields) {
    const pattern = field.chars.map((c) => c.c).join("");
    if (pattern === "" && !field.quoted) continue;
    const globEligible = field.chars.some(
      (c) => c.glob && (c.c === "*" || c.c === "?" || c.c === "["),
    );
    if (globEligible) {
      const matches = globExpand(ctx.vfs, ctx.env.cwd, pattern);
      if (matches && matches.length > 0) {
        result.push(...matches);
        continue;
      }
    }
    result.push(pattern);
  }
  return result;
}

export function expandWord(word: Word, ctx: ExpandCtx): string[] {
  let variants: Word[];
  const only = word.length === 1 ? word[0] : null;
  if (
    only &&
    only.kind === "lit" &&
    only.quote === "none" &&
    only.text.includes("{") &&
    !only.text.includes("$")
  ) {
    variants = braceExpand(only.text).map(
      (t): Word => [{ kind: "lit", text: t, quote: "none" } as Frag],
    );
  } else {
    variants = [word];
  }
  const out: string[] = [];
  for (const v of variants) out.push(...expandVariant(v, ctx));
  return out;
}

/** 分割もパス展開もせず、1つの文字列へ展開 (case の対象/パターン, リダイレクト先など)。 */
export function expandSingle(word: Word, ctx: ExpandCtx): string {
  let out = "";
  let first = true;
  for (const frag of word) {
    if (frag.kind === "lit") {
      if (frag.quote === "single") out += frag.text;
      else if (frag.quote === "double") out += expandVars(frag.text, ctx.env);
      else {
        let t = frag.text;
        if (first) t = tildeExpand(t, ctx.env);
        out += expandVars(t, ctx.env);
      }
    } else {
      const trimmed = frag.command.trim();
      out +=
        trimmed.startsWith("(") && trimmed.endsWith(")")
          ? String(evalArith(trimmed.slice(1, -1), ctx.env))
          : ctx.runSub(frag.command).replace(/\n+$/, "");
    }
    first = false;
  }
  return out;
}
