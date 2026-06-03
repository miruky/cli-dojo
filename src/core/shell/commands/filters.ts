import type { Command, ExecContext } from "../types";

interface Source {
  label: string;
  content: string;
}

function getSources(ctx: ExecContext, files: string[], cmd: string): { sources: Source[]; code: number } {
  if (files.length === 0) return { sources: [{ label: "-", content: ctx.stdin }], code: 0 };
  const sources: Source[] = [];
  let code = 0;
  for (const f of files) {
    if (f === "-") {
      sources.push({ label: "-", content: ctx.stdin });
      continue;
    }
    const node = ctx.vfs.stat(ctx.resolve(f));
    if (!node) {
      ctx.err(`${cmd}: ${f}: No such file or directory\n`);
      code = 1;
    } else if (node.type === "dir") {
      ctx.err(`${cmd}: ${f}: Is a directory\n`);
      code = 1;
    } else sources.push({ label: f, content: node.content });
  }
  return { sources, code };
}

function splitLines(content: string): string[] {
  const endsNL = content.endsWith("\n");
  const lines = content.split("\n");
  if (endsNL) lines.pop();
  return lines;
}

// ---- sort ----
function humanVal(s: string): number {
  const m = /^\s*(-?[\d.]+)\s*([KMGTP]?)/i.exec(s);
  if (!m) return 0;
  const mult: Record<string, number> = { "": 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1);
}

const sort: Command = {
  name: "sort",
  summary: "行をソート",
  run(ctx) {
    const args = ctx.args;
    let numeric = false, reverse = false, unique = false, fold = false, human = false, general = false;
    let sep: string | null = null;
    let keyField: number | null = null;
    const files: string[] = [];
    let i = 1;
    while (i < args.length) {
      const a = args[i];
      if (a === "--") {
        for (let k = i + 1; k < args.length; k++) files.push(args[k]);
        break;
      }
      if (a.startsWith("-t")) {
        sep = a.length > 2 ? a.slice(2) : args[++i] ?? "\t";
        i++;
        continue;
      }
      if (a.startsWith("-k")) {
        const spec = a.length > 2 ? a.slice(2) : args[++i] ?? "1";
        keyField = parseInt(spec, 10) || 1;
        if (/n/.test(spec)) numeric = true;
        if (/r/.test(spec)) reverse = true;
        i++;
        continue;
      }
      if (a.length > 1 && a[0] === "-") {
        for (const c of a.slice(1)) {
          if (c === "n") numeric = true;
          else if (c === "r") reverse = true;
          else if (c === "u") unique = true;
          else if (c === "f") fold = true;
          else if (c === "h") human = true;
          else if (c === "g") general = true;
        }
        i++;
        continue;
      }
      files.push(a);
      i++;
    }
    const { sources, code } = getSources(ctx, files, "sort");
    const lines = sources.flatMap((s) => splitLines(s.content));
    const keyOf = (line: string): string => {
      if (keyField == null) return line;
      const parts = sep != null ? line.split(sep) : line.replace(/^\s+/, "").split(/\s+/);
      return parts.slice(keyField - 1).join(sep ?? " ");
    };
    const cmp = (a: string, b: string): number => {
      let ka = keyOf(a);
      let kb = keyOf(b);
      if (numeric || general) return (parseFloat(ka) || 0) - (parseFloat(kb) || 0);
      if (human) return humanVal(ka) - humanVal(kb);
      if (fold) {
        ka = ka.toLowerCase();
        kb = kb.toLowerCase();
      }
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    };
    const sorted = lines.map((l, idx) => ({ l, idx })).sort((a, b) => cmp(a.l, b.l) || a.idx - b.idx).map((x) => x.l);
    if (reverse) sorted.reverse();
    let result = sorted;
    if (unique) {
      result = [];
      for (let k = 0; k < sorted.length; k++) {
        if (k === 0 || cmp(sorted[k], sorted[k - 1]) !== 0) result.push(sorted[k]);
      }
    }
    ctx.out(result.length ? result.join("\n") + "\n" : "");
    return code;
  },
};

// ---- uniq ----
const uniq: Command = {
  name: "uniq",
  summary: "隣接する重複行をまとめる",
  run(ctx) {
    const args = ctx.args;
    let count = false, onlyDup = false, onlyUniq = false, ignore = false;
    let skipFields = 0, skipChars = 0;
    const files: string[] = [];
    let i = 1;
    while (i < args.length) {
      const a = args[i];
      if (a.startsWith("-f")) { skipFields = parseInt(a.length > 2 ? a.slice(2) : args[++i], 10) || 0; i++; continue; }
      if (a.startsWith("-s")) { skipChars = parseInt(a.length > 2 ? a.slice(2) : args[++i], 10) || 0; i++; continue; }
      if (a.length > 1 && a[0] === "-") {
        for (const c of a.slice(1)) {
          if (c === "c") count = true;
          else if (c === "d") onlyDup = true;
          else if (c === "u") onlyUniq = true;
          else if (c === "i") ignore = true;
        }
        i++;
        continue;
      }
      files.push(a);
      i++;
    }
    const { sources, code } = getSources(ctx, files, "uniq");
    const lines = sources.flatMap((s) => splitLines(s.content));
    const keyOf = (line: string): string => {
      let parts = line.split(/(\s+)/);
      let s = line;
      if (skipFields > 0) {
        const f = line.replace(/^\s+/, "").split(/\s+/).slice(skipFields).join(" ");
        s = f;
      }
      void parts;
      if (skipChars > 0) s = s.slice(skipChars);
      return ignore ? s.toLowerCase() : s;
    };
    let out = "";
    let i2 = 0;
    while (i2 < lines.length) {
      let j = i2 + 1;
      while (j < lines.length && keyOf(lines[j]) === keyOf(lines[i2])) j++;
      const n = j - i2;
      const isDup = n > 1;
      if ((onlyDup && isDup) || (onlyUniq && !isDup) || (!onlyDup && !onlyUniq)) {
        out += (count ? String(n).padStart(7) + " " : "") + lines[i2] + "\n";
      }
      i2 = j;
    }
    ctx.out(out);
    return code;
  },
};

// ---- wc ----
const wc: Command = {
  name: "wc",
  summary: "行数・単語数・バイト数を数える",
  run(ctx) {
    const args = ctx.args;
    let l = false, w = false, c = false, m = false, L = false;
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a.length > 1 && a[0] === "-" && a !== "-") {
        for (const ch of a.slice(1)) {
          if (ch === "l") l = true;
          else if (ch === "w") w = true;
          else if (ch === "c") c = true;
          else if (ch === "m") m = true;
          else if (ch === "L") L = true;
        }
      } else files.push(a);
    }
    if (!l && !w && !c && !m && !L) {
      l = w = c = true;
    }
    const { sources, code } = getSources(ctx, files, "wc");
    const enc = new TextEncoder();
    let tl = 0, tw = 0, tc = 0, tL = 0;
    let out = "";
    const fmt = (label: string, content: string): string => {
      const lines = (content.match(/\n/g) || []).length;
      const words = content.split(/\s+/).filter(Boolean).length;
      const bytes = enc.encode(content).length;
      const chars = [...content].length;
      const maxLen = Math.max(0, ...splitLines(content).map((x) => [...x].length));
      tl += lines; tw += words; tc += (m ? chars : bytes); tL = Math.max(tL, maxLen);
      const cells: string[] = [];
      if (l) cells.push(String(lines).padStart(7));
      if (w) cells.push(String(words).padStart(7));
      if (c) cells.push(String(bytes).padStart(7));
      if (m) cells.push(String(chars).padStart(7));
      if (L) cells.push(String(maxLen).padStart(7));
      return cells.join(" ") + (label !== "-" ? " " + label : "") + "\n";
    };
    for (const s of sources) out += fmt(s.label, s.content);
    if (sources.length > 1) {
      const cells: string[] = [];
      if (l) cells.push(String(tl).padStart(7));
      if (w) cells.push(String(tw).padStart(7));
      if (c || m) cells.push(String(tc).padStart(7));
      if (L) cells.push(String(tL).padStart(7));
      out += cells.join(" ") + " total\n";
    }
    ctx.out(out);
    return code;
  },
};

// ---- head / tail ----
function parseCountArg(args: string[]): { n: number; mode: "lines" | "bytes"; plus: boolean; files: string[] } {
  let n = 10;
  let mode: "lines" | "bytes" = "lines";
  let plus = false;
  const files: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const mShort = /^-(\d+)$/.exec(a);
    if (mShort) {
      n = parseInt(mShort[1], 10);
      continue;
    }
    if (a.startsWith("-n")) {
      let v = a.length > 2 ? a.slice(2) : args[++i] ?? "10";
      if (v.startsWith("+")) {
        plus = true;
        v = v.slice(1);
      }
      n = parseInt(v, 10) || 0;
      continue;
    }
    if (a.startsWith("-c")) {
      mode = "bytes";
      let v = a.length > 2 ? a.slice(2) : args[++i] ?? "10";
      if (v.startsWith("+")) plus = true, (v = v.slice(1));
      n = parseInt(v, 10) || 0;
      continue;
    }
    if (a.startsWith("-") && a !== "-") continue;
    files.push(a);
  }
  return { n, mode, plus, files };
}

const head: Command = {
  name: "head",
  summary: "先頭の数行を表示",
  run(ctx) {
    const { n, mode, files } = parseCountArg(ctx.args);
    const { sources, code } = getSources(ctx, files, "head");
    let out = "";
    sources.forEach((s, idx) => {
      if (sources.length > 1) out += (idx > 0 ? "\n" : "") + `==> ${s.label} <==\n`;
      if (mode === "bytes") out += s.content.slice(0, n);
      else {
        const lines = splitLines(s.content);
        out += lines.slice(0, n).join("\n") + (lines.length ? "\n" : "");
      }
    });
    ctx.out(out);
    return code;
  },
};

const tail: Command = {
  name: "tail",
  summary: "末尾の数行を表示",
  run(ctx) {
    const { n, mode, plus, files } = parseCountArg(ctx.args);
    const { sources, code } = getSources(ctx, files, "tail");
    let out = "";
    sources.forEach((s, idx) => {
      if (sources.length > 1) out += (idx > 0 ? "\n" : "") + `==> ${s.label} <==\n`;
      if (mode === "bytes") out += plus ? s.content.slice(n - 1) : s.content.slice(-n);
      else {
        const lines = splitLines(s.content);
        const sel = plus ? lines.slice(n - 1) : lines.slice(Math.max(0, lines.length - n));
        out += sel.join("\n") + (sel.length ? "\n" : "");
      }
    });
    ctx.out(out);
    return code;
  },
};

// ---- cut ----
function parseRanges(list: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const part of list.split(",")) {
    const m = /^(\d*)-(\d*)$/.exec(part);
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : Infinity;
      ranges.push([a, b]);
    } else {
      const n = parseInt(part, 10);
      if (n) ranges.push([n, n]);
    }
  }
  return ranges;
}
function inRanges(n: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => n >= a && n <= b);
}

const cut: Command = {
  name: "cut",
  summary: "各行から列/フィールドを切り出す",
  run(ctx) {
    const args = ctx.args;
    let delim = "\t";
    let outDelim: string | null = null;
    let mode: "f" | "c" | "b" = "f";
    let list = "";
    let onlyDelim = false;
    let complement = false;
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith("-d")) { delim = a.length > 2 ? a.slice(2) : args[++i] ?? "\t"; continue; }
      if (a === "--complement") { complement = true; continue; }
      if (a.startsWith("--output-delimiter=")) { outDelim = a.slice(19); continue; }
      if (a.startsWith("-f")) { mode = "f"; list = a.length > 2 ? a.slice(2) : args[++i] ?? ""; continue; }
      if (a.startsWith("-c")) { mode = "c"; list = a.length > 2 ? a.slice(2) : args[++i] ?? ""; continue; }
      if (a.startsWith("-b")) { mode = "b"; list = a.length > 2 ? a.slice(2) : args[++i] ?? ""; continue; }
      if (a === "-s") { onlyDelim = true; continue; }
      if (a.startsWith("-") && a !== "-") continue;
      files.push(a);
    }
    const ranges = parseRanges(list);
    const od = outDelim ?? delim;
    const { sources, code } = getSources(ctx, files, "cut");
    let out = "";
    for (const s of sources) {
      for (const line of splitLines(s.content)) {
        if (mode === "f") {
          if (!line.includes(delim)) {
            if (!onlyDelim) out += line + "\n";
            continue;
          }
          const parts = line.split(delim);
          const sel = parts.filter((_, idx) => {
            const inR = inRanges(idx + 1, ranges);
            return complement ? !inR : inR;
          });
          out += sel.join(od) + "\n";
        } else {
          const chars = [...line];
          const sel = chars.filter((_, idx) => {
            const inR = inRanges(idx + 1, ranges);
            return complement ? !inR : inR;
          });
          out += sel.join("") + "\n";
        }
      }
    }
    ctx.out(out);
    return code;
  },
};

// ---- tr ----
function expandSet(set: string): string {
  const CLASSES: Record<string, string> = {
    alpha: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digit: "0123456789",
    alnum: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    space: " \t\n\r\f\v",
    blank: " \t",
    punct: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  };
  let s = set
    .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
  s = s.replace(/\[:(\w+):\]/g, (_, c: string) => CLASSES[c] ?? "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i + 1] === "-" && i + 2 < s.length) {
      const a = s.charCodeAt(i);
      const b = s.charCodeAt(i + 2);
      for (let x = a; x <= b; x++) out += String.fromCharCode(x);
      i += 2;
    } else out += s[i];
  }
  return out;
}

const tr: Command = {
  name: "tr",
  summary: "文字を変換・削除・圧縮",
  run(ctx) {
    const args = ctx.args.slice(1);
    let del = false, squeeze = false, complement = false;
    const operands: string[] = [];
    for (const a of args) {
      if (a.length > 1 && a[0] === "-" && /^-[dsc]+$/.test(a)) {
        for (const c of a.slice(1)) {
          if (c === "d") del = true;
          else if (c === "s") squeeze = true;
          else if (c === "c") complement = true;
        }
      } else operands.push(a);
    }
    let set1 = expandSet(operands[0] ?? "");
    const set2 = expandSet(operands[1] ?? "");
    if (complement) {
      let comp = "";
      const inSet = new Set(set1);
      for (let cc = 0; cc < 256; cc++) {
        const ch = String.fromCharCode(cc);
        if (!inSet.has(ch)) comp += ch;
      }
      set1 = comp;
    }
    const input = ctx.stdin;
    let out = "";
    if (del) {
      const drop = new Set(set1);
      for (const ch of input) if (!drop.has(ch)) out += ch;
      if (squeeze && set2) {
        out = squeezeChars(out, new Set(set2));
      }
    } else if (operands.length >= 2) {
      const map = new Map<string, string>();
      for (let i = 0; i < set1.length; i++) {
        map.set(set1[i], set2[i] ?? set2[set2.length - 1] ?? "");
      }
      for (const ch of input) out += map.get(ch) ?? ch;
      if (squeeze) out = squeezeChars(out, new Set(set2));
    } else if (squeeze) {
      out = squeezeChars(input, new Set(set1));
    } else out = input;
    ctx.out(out);
    return 0;
  },
};

function squeezeChars(s: string, set: Set<string>): string {
  let out = "";
  let prev = "";
  for (const ch of s) {
    if (ch === prev && set.has(ch)) continue;
    out += ch;
    prev = ch;
  }
  return out;
}

// ---- nl ----
const nl: Command = {
  name: "nl",
  summary: "行に番号を付ける",
  run(ctx) {
    const args = ctx.args;
    let body = "t"; // t=非空行, a=全行
    let width = 6;
    let sepStr = "\t";
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith("-b")) { body = (a.length > 2 ? a.slice(2) : args[++i] ?? "t")[0]; continue; }
      if (a.startsWith("-w")) { width = parseInt(a.length > 2 ? a.slice(2) : args[++i], 10) || 6; continue; }
      if (a.startsWith("-s")) { sepStr = a.length > 2 ? a.slice(2) : args[++i] ?? "\t"; continue; }
      if (a.startsWith("-") && a !== "-") continue;
      files.push(a);
    }
    const { sources, code } = getSources(ctx, files, "nl");
    let out = "";
    let n = 0;
    for (const s of sources) {
      for (const line of splitLines(s.content)) {
        if (body === "a" || line !== "") {
          n++;
          out += String(n).padStart(width) + sepStr + line + "\n";
        } else out += " ".repeat(width) + sepStr + line + "\n";
      }
    }
    ctx.out(out);
    return code;
  },
};

// ---- rev ----
const rev: Command = {
  name: "rev",
  summary: "各行の文字を逆順にする",
  run(ctx) {
    const args = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    const { sources, code } = getSources(ctx, args, "rev");
    let out = "";
    for (const s of sources) {
      for (const line of splitLines(s.content)) out += [...line].reverse().join("") + "\n";
    }
    ctx.out(out);
    return code;
  },
};

// ---- tee ----
const tee: Command = {
  name: "tee",
  summary: "標準入力をファイルと標準出力へ書き出す",
  run(ctx) {
    const append = ctx.args.includes("-a");
    const files = ctx.args.slice(1).filter((a) => a !== "-a" && !a.startsWith("-"));
    const data = ctx.stdin;
    for (const f of files) {
      const abs = ctx.resolve(f);
      const node = ctx.vfs.stat(abs);
      if (node && node.type === "file") {
        node.content = append ? node.content + data : data;
        node.mtime = new Date();
      } else if (!node) {
        ctx.vfs.createFile(abs, data);
      }
    }
    ctx.out(data);
    return 0;
  },
};

export const filterCommands: Command[] = [sort, uniq, wc, head, tail, cut, tr, nl, rev, tee];
