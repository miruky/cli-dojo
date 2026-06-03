import type { Command, ExecContext } from "../types";
import { visibleWidth } from "./util";

function splitLines(content: string): string[] {
  const endsNL = content.endsWith("\n");
  const lines = content.split("\n");
  if (endsNL) lines.pop();
  return lines;
}
function readFile(ctx: ExecContext, f: string): string | null {
  if (f === "-") return ctx.stdin;
  const node = ctx.vfs.stat(ctx.resolve(f));
  if (!node || node.type !== "file") return null;
  return node.content;
}
function unescape(s: string): string {
  return s.replace(/\\t/g, "\t").replace(/\\n/g, "\n").replace(/\\0/g, "\0").replace(/\\\\/g, "\\");
}

// ---- paste ----
const paste: Command = {
  name: "paste",
  summary: "ファイルを列方向に結合",
  run(ctx) {
    const args = ctx.args;
    let serial = false;
    let delims = ["\t"];
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === "-s") serial = true;
      else if (a === "-d") delims = [...unescape(args[++i] ?? "\t")];
      else if (a.startsWith("-d")) delims = [...unescape(a.slice(2))];
      else files.push(a);
    }
    if (delims.length === 0) delims = ["\t"];
    const contents = (files.length ? files : ["-"]).map((f) => readFile(ctx, f) ?? "");
    let out = "";
    if (serial) {
      for (const c of contents) {
        const lines = splitLines(c);
        out += lines.map((l, i) => (i === 0 ? l : delims[(i - 1) % delims.length] + l)).join("") + "\n";
      }
    } else {
      const lineArrays = contents.map(splitLines);
      const max = Math.max(0, ...lineArrays.map((a) => a.length));
      for (let r = 0; r < max; r++) {
        let row = "";
        for (let c = 0; c < lineArrays.length; c++) {
          if (c > 0) row += delims[(c - 1) % delims.length];
          row += lineArrays[c][r] ?? "";
        }
        out += row + "\n";
      }
    }
    ctx.out(out);
    return 0;
  },
};

// ---- comm ----
const comm: Command = {
  name: "comm",
  summary: "ソート済み2ファイルを比較 (3列)",
  run(ctx) {
    const args = ctx.args;
    const suppress = new Set<number>();
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (/^-[123]+$/.test(a)) for (const c of a.slice(1)) suppress.add(parseInt(c, 10));
      else files.push(a);
    }
    if (files.length < 2) {
      ctx.err("comm: 2つのファイルが必要です\n");
      return 1;
    }
    const a = splitLines(readFile(ctx, files[0]) ?? "");
    const b = splitLines(readFile(ctx, files[1]) ?? "");
    let i = 0;
    let j = 0;
    let out = "";
    const col1 = !suppress.has(1);
    const col2 = !suppress.has(2);
    const col3 = !suppress.has(3);
    const pre2 = col1 ? "\t" : "";
    const pre3 = (col1 ? "\t" : "") + (col2 ? "\t" : "");
    const emit1 = (l: string): void => {
      if (col1) out += l + "\n";
    };
    const emit2 = (l: string): void => {
      if (col2) out += pre2 + l + "\n";
    };
    const emit3 = (l: string): void => {
      if (col3) out += pre3 + l + "\n";
    };
    while (i < a.length && j < b.length) {
      if (a[i] < b[j]) emit1(a[i++]);
      else if (a[i] > b[j]) emit2(b[j++]);
      else {
        emit3(a[i]);
        i++;
        j++;
      }
    }
    while (i < a.length) emit1(a[i++]);
    while (j < b.length) emit2(b[j++]);
    ctx.out(out);
    return 0;
  },
};

// ---- join ----
const join: Command = {
  name: "join",
  summary: "共通フィールドで2ファイルを結合",
  run(ctx) {
    const args = ctx.args;
    let f1 = 1;
    let f2 = 1;
    let sep: string | null = null;
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === "-1") f1 = parseInt(args[++i], 10) || 1;
      else if (a === "-2") f2 = parseInt(args[++i], 10) || 1;
      else if (a === "-t") sep = args[++i] ?? "\t";
      else if (a.startsWith("-t")) sep = a.slice(2);
      else files.push(a);
    }
    if (files.length < 2) {
      ctx.err("join: 2つのファイルが必要です\n");
      return 1;
    }
    const split = (l: string): string[] => (sep != null ? l.split(sep) : l.trim().split(/\s+/));
    const osep = sep ?? " ";
    const a = splitLines(readFile(ctx, files[0]) ?? "");
    const b = splitLines(readFile(ctx, files[1]) ?? "");
    const bIndex = new Map<string, string[][]>();
    for (const l of b) {
      const parts = split(l);
      const key = parts[f2 - 1] ?? "";
      if (!bIndex.has(key)) bIndex.set(key, []);
      bIndex.get(key)!.push(parts);
    }
    let out = "";
    for (const l of a) {
      const pa = split(l);
      const key = pa[f1 - 1] ?? "";
      const matches = bIndex.get(key);
      if (!matches) continue;
      for (const pb of matches) {
        const restA = pa.filter((_, idx) => idx !== f1 - 1);
        const restB = pb.filter((_, idx) => idx !== f2 - 1);
        out += [key, ...restA, ...restB].join(osep) + "\n";
      }
    }
    ctx.out(out);
    return 0;
  },
};

// ---- fold ----
const fold: Command = {
  name: "fold",
  summary: "行を指定幅で折り返す",
  run(ctx) {
    const args = ctx.args;
    let width = 80;
    let spaces = false;
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === "-s") spaces = true;
      else if (a === "-w") width = parseInt(args[++i], 10) || 80;
      else if (a.startsWith("-w")) width = parseInt(a.slice(2), 10) || 80;
      else if (a === "-b") {
        /* バイト単位 (簡略化: 文字単位と同じ) */
      } else files.push(a);
    }
    const contents = (files.length ? files : ["-"]).map((f) => readFile(ctx, f) ?? "");
    let out = "";
    for (const c of contents) {
      for (const line of splitLines(c)) {
        let rest = line;
        if (rest === "") {
          out += "\n";
          continue;
        }
        while (rest.length > width) {
          let cut = width;
          if (spaces) {
            const sp = rest.lastIndexOf(" ", width);
            if (sp > 0) cut = sp + 1;
          }
          out += rest.slice(0, cut) + "\n";
          rest = rest.slice(cut);
        }
        out += rest + "\n";
      }
    }
    ctx.out(out);
    return 0;
  },
};

// ---- column ----
const column: Command = {
  name: "column",
  summary: "入力を表形式に整形",
  run(ctx) {
    const args = ctx.args;
    let table = false;
    let sep: string | null = null;
    let osep = "  ";
    const files: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === "-t") table = true;
      else if (a === "-s") sep = args[++i] ?? null;
      else if (a.startsWith("-s")) sep = a.slice(2);
      else if (a === "-o") osep = args[++i] ?? "  ";
      else if (a.startsWith("-") && a.length > 1) {
        /* ignore */
      } else files.push(a);
    }
    const content = files.length ? files.map((f) => readFile(ctx, f) ?? "").join("") : ctx.stdin;
    const lines = splitLines(content).filter((l) => l !== "");
    let out = "";
    if (table) {
      const rows = lines.map((l) => (sep != null ? l.split(sep) : l.trim().split(/\s+/)));
      const widths: number[] = [];
      for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, visibleWidth(c))));
      for (const r of rows) {
        out +=
          r
            .map((c, i) => (i === r.length - 1 ? c : c + " ".repeat(widths[i] - visibleWidth(c))))
            .join(osep) + "\n";
      }
    } else {
      // 簡易: 端末幅に詰める
      const colW = Math.max(1, ...lines.map((l) => visibleWidth(l))) + 2;
      const perRow = Math.max(1, Math.floor(ctx.cols / colW));
      for (let i = 0; i < lines.length; i += perRow) {
        out += lines.slice(i, i + perRow).map((l) => l.padEnd(colW)).join("").replace(/\s+$/, "") + "\n";
      }
    }
    ctx.out(out);
    return 0;
  },
};

// ---- xargs ----
const xargs: Command = {
  name: "xargs",
  summary: "標準入力を引数にコマンドを実行",
  run(ctx) {
    const args = ctx.args;
    let nullDelim = false;
    let delim: string | null = null;
    let maxArgs = 0;
    let replace: string | null = null;
    let noRunIfEmpty = false;
    const cmd: string[] = [];
    let i = 1;
    for (; i < args.length; i++) {
      const a = args[i];
      if (a === "-0") nullDelim = true;
      else if (a === "-r" || a === "--no-run-if-empty") noRunIfEmpty = true;
      else if (a === "-n") maxArgs = parseInt(args[++i], 10) || 0;
      else if (a.startsWith("-n")) maxArgs = parseInt(a.slice(2), 10) || 0;
      else if (a === "-d") delim = unescape(args[++i] ?? "");
      else if (a.startsWith("-d")) delim = unescape(a.slice(2));
      else if (a === "-I" || a === "-i") replace = args[++i] ?? "{}";
      else if (a.startsWith("-I")) replace = a.slice(2);
      else break;
    }
    for (; i < args.length; i++) cmd.push(args[i]);
    if (cmd.length === 0) cmd.push("echo");

    let out = "";
    let err = "";
    let code = 0;
    const runChunk = (extra: string[]): void => {
      const argv = [...cmd, ...extra];
      const r = ctx.services.runArgv(argv, "");
      out += r.stdout;
      err += r.stderr;
      if (r.code !== 0) code = r.code;
    };

    if (replace) {
      const lines = splitLines(ctx.stdin);
      for (const line of lines) {
        if (line === "") continue;
        const argv = cmd.map((a) => a.split(replace!).join(line));
        const r = ctx.services.runArgv(argv, "");
        out += r.stdout;
        err += r.stderr;
        if (r.code !== 0) code = r.code;
      }
    } else {
      let items: string[];
      if (nullDelim) items = ctx.stdin.split("\0").filter((x) => x !== "");
      else if (delim != null) items = ctx.stdin.split(delim).filter((x) => x !== "");
      else items = ctx.stdin.split(/\s+/).filter((x) => x !== "");
      if (items.length === 0 && noRunIfEmpty) {
        return 0;
      }
      const n = maxArgs > 0 ? maxArgs : items.length || 1;
      if (items.length === 0) runChunk([]);
      else for (let k = 0; k < items.length; k += n) runChunk(items.slice(k, k + n));
    }
    if (err) ctx.err(err);
    ctx.out(out);
    return code;
  },
};

export const textMoreCommands: Command[] = [paste, comm, join, fold, column, xargs];
