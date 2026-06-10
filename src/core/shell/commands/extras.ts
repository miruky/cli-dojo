import type { Command, ExecContext } from "../types";
import { evalArith } from "../arith";
import { unifiedDiff } from "./git";

/** coreutils の残り: diff / cmp / bc / expr / cal / shuf / yes / xxd / hexdump / od / strings / split / fmt / whatis / apropos / factor。 */

function readFileOrStdin(ctx: ExecContext, path: string | undefined): string | null {
  if (!path || path === "-") return ctx.stdin;
  const node = ctx.vfs.stat(ctx.resolve(path));
  if (!node || node.type !== "file") {
    ctx.err(`${ctx.args[0]}: ${path}: そのようなファイルはありません\n`);
    return null;
  }
  return node.content;
}

const diff: Command = {
  name: "diff",
  summary: "2つのファイルの差分を表示 (-u で unified)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const files = args.filter((a) => !a.startsWith("-") || a === "-");
    if (files.length < 2) {
      ctx.err("diff: 2つのファイルを指定してください (例: diff -u a.txt b.txt)\n");
      return 2;
    }
    const a = readFileOrStdin(ctx, files[0]);
    const b = readFileOrStdin(ctx, files[1]);
    if (a == null || b == null) return 2;
    if (a === b) return 0;
    const unified = args.includes("-u") || args.includes("--unified");
    if (unified) {
      ctx.out(unifiedDiff(a, b, files[0], files[1], ctx.tty));
      return 1;
    }
    // 旧形式 (ed 風): シンプルに行単位の変更ブロックを出す
    const al = a.split("\n");
    const bl = b.split("\n");
    if (al.length && al[al.length - 1] === "") al.pop();
    if (bl.length && bl[bl.length - 1] === "") bl.pop();
    let i = 0;
    let j = 0;
    while (i < al.length || j < bl.length) {
      if (i < al.length && j < bl.length && al[i] === bl[j]) {
        i++; j++;
        continue;
      }
      // 変更ブロックの終わりを探す (次に一致する行)
      let ni = i, nj = j;
      let found = false;
      outer: for (let span = 1; span < 200 && !found; span++) {
        for (let x = 0; x <= span; x++) {
          ni = i + x; nj = j + (span - x);
          if (ni <= al.length && nj <= bl.length && (ni === al.length && nj === bl.length || (ni < al.length && nj < bl.length && al[ni] === bl[nj]))) {
            found = true;
            break outer;
          }
        }
      }
      if (!found) { ni = al.length; nj = bl.length; }
      const delCount = ni - i;
      const addCount = nj - j;
      const aRange = delCount <= 1 ? String(i + (delCount ? 1 : 0)) : `${i + 1},${ni}`;
      const bRange = addCount <= 1 ? String(j + (addCount ? 1 : 0)) : `${j + 1},${nj}`;
      const op = delCount && addCount ? "c" : delCount ? "d" : "a";
      ctx.out(`${aRange}${op}${bRange}\n`);
      for (let x = i; x < ni; x++) ctx.out(`< ${al[x]}\n`);
      if (delCount && addCount) ctx.out("---\n");
      for (let x = j; x < nj; x++) ctx.out(`> ${bl[x]}\n`);
      i = ni; j = nj;
    }
    return 1;
  },
};

const cmp: Command = {
  name: "cmp",
  summary: "2つのファイルをバイト比較",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    if (files.length < 2) {
      ctx.err("cmp: 2つのファイルを指定してください\n");
      return 2;
    }
    const a = readFileOrStdin(ctx, files[0]);
    const b = readFileOrStdin(ctx, files[1]);
    if (a == null || b == null) return 2;
    if (a === b) return 0;
    let line = 1;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        ctx.out(`${files[0]} ${files[1]} differ: byte ${i + 1}, line ${line}\n`);
        return 1;
      }
      if (a[i] === "\n") line++;
    }
    ctx.out(`cmp: EOF on ${a.length < b.length ? files[0] : files[1]}\n`);
    return 1;
  },
};

const bc: Command = {
  name: "bc",
  summary: "計算機 (echo \"2*(3+4)\" | bc)",
  run(ctx) {
    const exprs = ctx.stdin.split("\n").filter((l) => l.trim() !== "");
    if (exprs.length === 0) {
      ctx.err('bc: 式をパイプで渡してください (例: echo "12*34" | bc)\n');
      return 1;
    }
    for (const e of exprs) {
      if (e.trim() === "quit") break;
      try {
        ctx.out(String(evalArith(e, ctx.env)) + "\n");
      } catch (err) {
        ctx.err(`bc: ${(err as Error).message}\n`);
        return 1;
      }
    }
    return 0;
  },
};

const expr: Command = {
  name: "expr",
  summary: "式を評価 (expr 1 + 2)",
  run(ctx) {
    const e = ctx.args.slice(1).join(" ");
    if (!e) {
      ctx.err("expr: 式を指定してください\n");
      return 2;
    }
    try {
      const v = evalArith(e, ctx.env);
      ctx.out(String(v) + "\n");
      return v === 0 ? 1 : 0;
    } catch {
      // 文字列比較 (a = b) など最低限
      ctx.err(`expr: 構文エラー: ${e}\n`);
      return 2;
    }
  },
};

const cal: Command = {
  name: "cal",
  summary: "カレンダーを表示",
  run(ctx) {
    const args = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-origin
    if (args.length === 1) year = parseInt(args[0], 10) || year;
    if (args.length >= 2) {
      month = (parseInt(args[0], 10) || month + 1) - 1;
      year = parseInt(args[1], 10) || year;
    }
    const months = args.length === 1 ? [...Array(12).keys()] : [month];
    for (const m of months) {
      const title = `${year}年 ${m + 1}月`;
      const pad = Math.max(0, Math.floor((20 - title.length * 2 + 4) / 2));
      ctx.out(" ".repeat(pad) + title + "\n");
      ctx.out("日 月 火 水 木 金 土\n");
      const first = new Date(year, m, 1).getDay();
      const days = new Date(year, m + 1, 0).getDate();
      let line = "   ".repeat(first);
      for (let d = 1; d <= days; d++) {
        const isToday = year === now.getFullYear() && m === now.getMonth() && d === now.getDate();
        const cell = String(d).padStart(2);
        line += (isToday && ctx.tty ? `\x1b[7m${cell}\x1b[0m` : cell) + " ";
        if ((first + d) % 7 === 0) {
          ctx.out(line.trimEnd() + "\n");
          line = "";
        }
      }
      if (line.trim()) ctx.out(line.trimEnd() + "\n");
      ctx.out("\n");
    }
    return 0;
  },
};

const shuf: Command = {
  name: "shuf",
  summary: "行をシャッフルして出力 (-n 件数)",
  run(ctx) {
    const args = ctx.args.slice(1);
    let n = Infinity;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-n") n = parseInt(args[++i], 10) || Infinity;
      else if (args[i].startsWith("-n")) n = parseInt(args[i].slice(2), 10) || Infinity;
      else if (args[i] === "-e") {
        // 残りを候補として扱う
        const rest = args.slice(i + 1);
        shuffle(rest);
        for (const r of rest.slice(0, Math.min(n, rest.length))) ctx.out(r + "\n");
        return 0;
      } else if (!args[i].startsWith("-")) files.push(args[i]);
    }
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    const lines = content.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    shuffle(lines);
    for (const l of lines.slice(0, Math.min(n, lines.length))) ctx.out(l + "\n");
    return 0;
  },
};

function shuffle(a: string[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

const yes: Command = {
  name: "yes",
  summary: "y (または指定文字列) を繰り返す (上限あり)",
  run(ctx) {
    const word = ctx.args.slice(1).join(" ") || "y";
    const limit = ctx.tty ? 30 : 1000;
    for (let i = 0; i < limit; i++) ctx.out(word + "\n");
    if (ctx.tty) ctx.out(`\x1b[38;2;120;128;150m(本物は無限ですが ${limit} 行で打ち切りました — Ctrl-C の練習は別の機会に)\x1b[0m\n`);
    return 0;
  },
};

function dumpBytes(content: string): number[] {
  // UTF-8 バイト列にする
  const bytes: number[] = [];
  for (const ch of content) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return bytes;
}

const xxd: Command = {
  name: "xxd",
  summary: "16進ダンプ",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    const bytes = dumpBytes(content);
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = bytes.slice(off, off + 16);
      let hex = "";
      for (let i = 0; i < 16; i += 2) {
        const b1 = chunk[i] != null ? chunk[i].toString(16).padStart(2, "0") : "  ";
        const b2 = chunk[i + 1] != null ? chunk[i + 1].toString(16).padStart(2, "0") : "  ";
        hex += b1 + b2 + " ";
      }
      const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      ctx.out(`${off.toString(16).padStart(8, "0")}: ${hex} ${ascii}\n`);
    }
    return 0;
  },
};

const hexdump: Command = {
  name: "hexdump",
  summary: "16進ダンプ (-C で canonical)",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    const bytes = dumpBytes(content);
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = bytes.slice(off, off + 16);
      const hex1 = chunk.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const hex2 = chunk.slice(8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      ctx.out(`${off.toString(16).padStart(8, "0")}  ${hex1.padEnd(23)}  ${hex2.padEnd(23)}  |${ascii}|\n`);
    }
    ctx.out(`${bytes.length.toString(16).padStart(8, "0")}\n`);
    return 0;
  },
};

const od: Command = {
  name: "od",
  summary: "8進/16進ダンプ (-c 文字表示)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const charMode = args.includes("-c");
    const files = args.filter((a) => !a.startsWith("-"));
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    const bytes = dumpBytes(content);
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = bytes.slice(off, off + 16);
      let body: string;
      if (charMode) {
        body = chunk
          .map((b) => {
            if (b === 10) return "\\n";
            if (b === 9) return "\\t";
            if (b >= 32 && b < 127) return String.fromCharCode(b);
            return b.toString(8).padStart(3, "0");
          })
          .map((s) => s.padStart(3))
          .join(" ");
      } else {
        const words: string[] = [];
        for (let i = 0; i < chunk.length; i += 2) {
          words.push((((chunk[i + 1] ?? 0) << 8) | chunk[i]).toString(8).padStart(6, "0"));
        }
        body = words.join(" ");
      }
      ctx.out(`${off.toString(8).padStart(7, "0")} ${body}\n`);
    }
    ctx.out(`${bytes.length.toString(8).padStart(7, "0")}\n`);
    return 0;
  },
};

const strings: Command = {
  name: "strings",
  summary: "表示可能な文字列を抽出",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    const matches = content.match(/[\x20-\x7e]{4,}/g) ?? [];
    for (const m of matches) ctx.out(m + "\n");
    return 0;
  },
};

const split: Command = {
  name: "split",
  summary: "ファイルを分割 (-l 行数)",
  run(ctx) {
    const args = ctx.args.slice(1);
    let linesPer = 1000;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-l") linesPer = parseInt(args[++i], 10) || 1000;
      else if (args[i].startsWith("-l")) linesPer = parseInt(args[i].slice(2), 10) || 1000;
      else if (!args[i].startsWith("-")) rest.push(args[i]);
    }
    const content = readFileOrStdin(ctx, rest[0]);
    if (content == null) return 1;
    const prefix = rest[1] ?? "x";
    const lines = content.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    let idx = 0;
    for (let i = 0; i < lines.length; i += linesPer) {
      const suffix = String.fromCharCode(97 + Math.floor(idx / 26)) + String.fromCharCode(97 + (idx % 26));
      const chunk = lines.slice(i, i + linesPer).join("\n") + "\n";
      const abs = ctx.resolve(prefix + suffix);
      const node = ctx.vfs.stat(abs);
      if (node && node.type === "file") node.content = chunk;
      else ctx.vfs.createFile(abs, chunk);
      idx++;
    }
    return 0;
  },
};

const fmt: Command = {
  name: "fmt",
  summary: "段落を指定幅に整形 (-w 幅)",
  run(ctx) {
    const args = ctx.args.slice(1);
    let width = 75;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-w") width = parseInt(args[++i], 10) || 75;
      else if (/^-\d+$/.test(args[i])) width = parseInt(args[i].slice(1), 10);
      else if (!args[i].startsWith("-")) files.push(args[i]);
    }
    const content = readFileOrStdin(ctx, files[0]);
    if (content == null) return 1;
    for (const para of content.split(/\n\s*\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      let line = "";
      for (const w of words) {
        if (line === "") line = w;
        else if (line.length + 1 + w.length <= width) line += " " + w;
        else {
          ctx.out(line + "\n");
          line = w;
        }
      }
      if (line) ctx.out(line + "\n");
      ctx.out("\n");
    }
    return 0;
  },
};

const whatis: Command = {
  name: "whatis",
  summary: "コマンドの一行説明を表示",
  run(ctx) {
    const topics = ctx.args.slice(1);
    if (topics.length === 0) {
      ctx.err("whatis: コマンド名を指定してください\n");
      return 1;
    }
    let code = 0;
    for (const t of topics) {
      const cmd = ctx.services.listCommands().find((c) => c.name === t);
      if (cmd) ctx.out(`${cmd.name} (1)            - ${cmd.summary}\n`);
      else {
        ctx.err(`${t}: 見つかりません\n`);
        code = 16;
      }
    }
    return code;
  },
};

const apropos: Command = {
  name: "apropos",
  summary: "キーワードでコマンドを探す",
  run(ctx) {
    const kw = ctx.args.slice(1).join(" ").toLowerCase();
    if (!kw) {
      ctx.err("apropos: キーワードを指定してください\n");
      return 1;
    }
    let hit = false;
    for (const c of ctx.services.listCommands()) {
      if (c.name.includes(kw) || c.summary.toLowerCase().includes(kw)) {
        ctx.out(`${c.name} (1)            - ${c.summary}\n`);
        hit = true;
      }
    }
    if (!hit) ctx.err(`apropos: 該当なし: ${kw}\n`);
    return hit ? 0 : 16;
  },
};

const factor: Command = {
  name: "factor",
  summary: "素因数分解",
  run(ctx) {
    const nums = ctx.args.length > 1 ? ctx.args.slice(1) : ctx.stdin.split(/\s+/).filter(Boolean);
    for (const s of nums) {
      let n = parseInt(s, 10);
      if (!Number.isFinite(n) || n < 1) {
        ctx.err(`factor: '${s}' は正の整数ではありません\n`);
        return 1;
      }
      const fs: number[] = [];
      for (let p = 2; p * p <= n; p++) {
        while (n % p === 0) {
          fs.push(p);
          n /= p;
        }
      }
      if (n > 1) fs.push(n);
      ctx.out(`${s}: ${fs.join(" ")}\n`);
    }
    return 0;
  },
};

export const extraCommands: Command[] = [
  diff, cmp, bc, expr, cal, shuf, yes, xxd, hexdump, od, strings, split, fmt, whatis, apropos, factor,
];
