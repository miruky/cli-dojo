import type { Environment } from "./Environment";
import type { VFS } from "../vfs/VFS";
import { globExpand } from "./glob";
import type { Frag, Word } from "./parser";

export interface ExpandCtx {
  env: Environment;
  vfs: VFS;
  /** コマンド置換 $(...) / `...` の実行。stdout を返す。 */
  runSub: (command: string) => string;
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
        const end = text.indexOf("}", i + 2);
        if (end >= 0) {
          out += env.get(text.slice(i + 2, end)) ?? "";
          i = end + 1;
          continue;
        }
      }
      if (nx === "?" || nx === "$" || nx === "0") {
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
      const output = ctx.runSub(frag.command).replace(/\n+$/, "");
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
