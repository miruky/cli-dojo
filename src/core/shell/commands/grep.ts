import type { Command } from "../types";
import { makeRegex, toJsRegexSource } from "../regex";
import type { VNode } from "../../vfs/VFS";

const RED = "\x1b[1;31m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

interface Source {
  label: string;
  content: string;
}

function walkFiles(dir: VNode, prefix: string, out: Source[]): void {
  if (!dir.children) return;
  for (const [name, child] of [...dir.children.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const path = prefix.endsWith("/") ? prefix + name : prefix + "/" + name;
    if (child.type === "dir") walkFiles(child, path, out);
    else if (child.type === "file") out.push({ label: path, content: child.content });
  }
}

export const grep: Command = {
  name: "grep",
  summary: "パターンに一致する行を検索 (正規表現)",
  run(ctx) {
    const prog = ctx.args[0];
    let extended = prog === "egrep";
    let fixed = prog === "fgrep";
    let ignoreCase = false;
    let invert = false;
    let showNum = false;
    let onlyMatch = false;
    let countOnly = false;
    let recursive = false;
    let wholeWord = false;
    let wholeLine = false;
    let listFiles = false;
    let listNoFiles = false;
    let quiet = false;
    let color = false;
    let noFilename = false;
    let withFilename = false;
    let after = 0;
    let before = 0;
    const patterns: string[] = [];
    let patternGiven = false;
    const files: string[] = [];

    const args = ctx.args;
    let i = 1;
    const grab = (inline: string, idx: number): { val: string; idx: number } =>
      inline !== "" ? { val: inline, idx } : { val: args[idx + 1] ?? "", idx: idx + 1 };

    while (i < args.length) {
      const a = args[i];
      if (a === "--") {
        for (let k = i + 1; k < args.length; k++) files.push(args[k]);
        break;
      }
      if (a.length > 2 && a.startsWith("--")) {
        if (a.startsWith("--color"))
          // =auto はパイプ先を汚さないよう tty のときだけ色付け
          color = a.includes("=never") ? false : a.includes("=always") ? true : ctx.tty;
        else if (a === "--invert-match") invert = true;
        else if (a === "--ignore-case") ignoreCase = true;
        else if (a === "--line-number") showNum = true;
        else if (a === "--only-matching") onlyMatch = true;
        else if (a === "--count") countOnly = true;
        else if (a === "--recursive") recursive = true;
        else if (a === "--word-regexp") wholeWord = true;
        else if (a === "--fixed-strings") fixed = true;
        else if (a === "--extended-regexp") extended = true;
        else if (a.startsWith("--regexp=")) {
          patterns.push(a.slice(9));
          patternGiven = true;
        }
        i++;
        continue;
      }
      if (a.length > 1 && a[0] === "-") {
        let j = 1;
        let jumped = false;
        while (j < a.length) {
          const c = a[j];
          if (c === "A" || c === "B" || c === "C") {
            const r = grab(a.slice(j + 1), i);
            const n = parseInt(r.val, 10) || 0;
            if (c === "A") after = n;
            else if (c === "B") before = n;
            else {
              after = n;
              before = n;
            }
            i = r.idx;
            jumped = true;
            break;
          }
          if (c === "e") {
            const r = grab(a.slice(j + 1), i);
            patterns.push(r.val);
            patternGiven = true;
            i = r.idx;
            jumped = true;
            break;
          }
          if (c === "f") {
            const r = grab(a.slice(j + 1), i);
            const node = ctx.vfs.stat(ctx.resolve(r.val));
            if (node && node.type === "file")
              for (const ln of node.content.split("\n")) if (ln !== "") patterns.push(ln);
            patternGiven = true;
            i = r.idx;
            jumped = true;
            break;
          }
          switch (c) {
            case "E": extended = true; break;
            case "F": fixed = true; break;
            case "G": extended = false; break;
            case "i": ignoreCase = true; break;
            case "v": invert = true; break;
            case "n": showNum = true; break;
            case "o": onlyMatch = true; break;
            case "c": countOnly = true; break;
            case "r": case "R": recursive = true; break;
            case "w": wholeWord = true; break;
            case "x": wholeLine = true; break;
            case "l": listFiles = true; break;
            case "L": listNoFiles = true; break;
            case "q": quiet = true; break;
            case "h": noFilename = true; break;
            case "H": withFilename = true; break;
            case "s": break;
            default: break;
          }
          j++;
        }
        void jumped;
        i++;
        continue;
      }
      if (!patternGiven) {
        patterns.push(a);
        patternGiven = true;
      } else files.push(a);
      i++;
    }

    if (patterns.length === 0) {
      ctx.err("grep: 検索パターンがありません\n");
      return 2;
    }

    const opt = { extended, ignoreCase, fixed, wholeWord, wholeLine };
    let testRes: RegExp[];
    let colorRe: RegExp;
    try {
      testRes = patterns.map((p) => makeRegex(p, opt));
      const combined = patterns
        .map((p) => `(?:${toJsRegexSource(p, opt)})`)
        .join("|");
      colorRe = new RegExp(combined, "g" + (ignoreCase ? "i" : ""));
    } catch {
      ctx.err("grep: 不正な正規表現です\n");
      return 2;
    }

    const sources: Source[] = [];
    if (files.length === 0 && !recursive) {
      sources.push({ label: "(standard input)", content: ctx.stdin });
    } else {
      const paths = files.length ? files : ["."];
      for (const p of paths) {
        const node = ctx.vfs.stat(ctx.resolve(p));
        if (!node) {
          ctx.err(`grep: ${p}: No such file or directory\n`);
          continue;
        }
        if (node.type === "dir") {
          if (recursive) walkFiles(node, p, sources);
          else ctx.err(`grep: ${p}: Is a directory\n`);
        } else sources.push({ label: p, content: node.content });
      }
    }

    const showFilename = !noFilename && (withFilename || recursive || sources.length > 1);
    const matchLine = (line: string): boolean => {
      const m = testRes.some((re) => re.test(line));
      return invert ? !m : m;
    };
    const colorize = (line: string): string =>
      color ? line.replace(colorRe, (m) => (m ? RED + m + RESET : m)) : line;
    const prefix = (label: string, sep: string, idx: number): string => {
      let s = "";
      if (showFilename) s += (color ? MAGENTA + label + RESET + (sep === ":" ? CYAN + ":" + RESET : sep) : label + sep);
      if (showNum) s += (color ? CYAN + String(idx + 1) + RESET + (sep === ":" ? CYAN + ":" + RESET : sep) : String(idx + 1) + sep);
      return s;
    };

    let out = "";
    let anyMatch = false;

    for (const src of sources) {
      const endsNL = src.content.endsWith("\n");
      const lines = src.content.split("\n");
      if (endsNL) lines.pop();
      const matched = lines.map(matchLine);
      const count = matched.filter(Boolean).length;
      if (count > 0) anyMatch = true;

      if (quiet) {
        if (anyMatch) return 0;
        continue;
      }
      if (listFiles) {
        if (count > 0) out += src.label + "\n";
        continue;
      }
      if (listNoFiles) {
        if (count === 0) out += src.label + "\n";
        continue;
      }
      if (countOnly) {
        out += (showFilename ? src.label + ":" : "") + count + "\n";
        continue;
      }

      if (onlyMatch) {
        for (let idx = 0; idx < lines.length; idx++) {
          if (!matched[idx]) continue;
          const ms = lines[idx].match(colorRe);
          if (ms) for (const m of ms) out += prefix(src.label, ":", idx) + (color ? RED + m + RESET : m) + "\n";
        }
        continue;
      }

      // 通常 + 文脈 (-A/-B/-C)
      const printType = new Map<number, "match" | "context">();
      for (let idx = 0; idx < lines.length; idx++) {
        if (!matched[idx]) continue;
        for (let k = Math.max(0, idx - before); k <= Math.min(lines.length - 1, idx + after); k++) {
          if (k === idx) printType.set(k, "match");
          else if (!printType.has(k)) printType.set(k, "context");
        }
      }
      const indices = [...printType.keys()].sort((a, b) => a - b);
      let prev = -2;
      for (const idx of indices) {
        if ((before > 0 || after > 0) && prev >= 0 && idx - prev > 1) out += "--\n";
        const type = printType.get(idx)!;
        const sep = type === "match" ? ":" : "-";
        const body = type === "match" ? colorize(lines[idx]) : lines[idx];
        out += prefix(src.label, sep, idx) + body + "\n";
        prev = idx;
      }
    }

    if (quiet) return anyMatch ? 0 : 1;
    ctx.out(out);
    return anyMatch ? 0 : 1;
  },
};
