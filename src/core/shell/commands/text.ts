import type { Command, ExecContext } from "../types";
import { parseArgs } from "./util";

const ESC: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  e: "\x1b",
};

function interpretEscapes(s: string): string {
  return s.replace(/\\(n|t|r|\\|a|b|f|v|0|e)/g, (_, c: string) => ESC[c] ?? "\\" + c);
}

function readInputs(ctx: ExecContext, files: string[]): { text: string; code: number } {
  let text = "";
  let code = 0;
  for (const f of files) {
    if (f === "-") {
      text += ctx.stdin;
      continue;
    }
    const node = ctx.vfs.stat(ctx.resolve(f));
    if (!node) {
      ctx.err(`cat: ${f}: No such file or directory\n`);
      code = 1;
    } else if (node.type === "dir") {
      ctx.err(`cat: ${f}: Is a directory\n`);
      code = 1;
    } else text += node.content;
  }
  return { text, code };
}

const echo: Command = {
  name: "echo",
  summary: "引数を表示",
  run(ctx) {
    let i = 1;
    let noNewline = false;
    let escapes = false;
    while (i < ctx.args.length && /^-[neE]+$/.test(ctx.args[i])) {
      const f = ctx.args[i];
      if (f.includes("n")) noNewline = true;
      if (f.includes("e")) escapes = true;
      if (f.includes("E")) escapes = false;
      i++;
    }
    let text = ctx.args.slice(i).join(" ");
    if (escapes) text = interpretEscapes(text);
    ctx.out(text + (noNewline ? "" : "\n"));
    return 0;
  },
};

const cat: Command = {
  name: "cat",
  summary: "ファイル内容を連結して表示",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const number = flags.has("n");
    const numberNonBlank = flags.has("b");
    const showEnds = flags.has("E") || flags.has("A");
    const showTabs = flags.has("T") || flags.has("A");
    const squeeze = flags.has("s");
    const sources = rest.length ? rest : ["-"];

    let out = "";
    let n = 0;
    let prevBlank = false;
    let code = 0;
    const emit = (content: string): void => {
      const endsNL = content.endsWith("\n");
      let lines = content.split("\n");
      if (endsNL) lines = lines.slice(0, -1);
      for (let line of lines) {
        if (squeeze) {
          if (line === "") {
            if (prevBlank) continue;
            prevBlank = true;
          } else prevBlank = false;
        }
        if (showTabs) line = line.replace(/\t/g, "^I");
        if (showEnds) line = line + "$";
        if (numberNonBlank) {
          if (line !== "") {
            n++;
            line = String(n).padStart(6) + "\t" + line;
          }
        } else if (number) {
          n++;
          line = String(n).padStart(6) + "\t" + line;
        }
        out += line + "\n";
      }
    };

    for (const f of sources) {
      if (f === "-") {
        emit(ctx.stdin);
        continue;
      }
      const node = ctx.vfs.stat(ctx.resolve(f));
      if (!node) {
        ctx.err(`cat: ${f}: No such file or directory\n`);
        code = 1;
      } else if (node.type === "dir") {
        ctx.err(`cat: ${f}: Is a directory\n`);
        code = 1;
      } else emit(node.content);
    }
    ctx.out(out);
    return code;
  },
};

const tac: Command = {
  name: "tac",
  summary: "行を逆順に表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    const { text, code } = readInputs(ctx, rest.length ? rest : ["-"]);
    const endsNL = text.endsWith("\n");
    let lines = text.split("\n");
    if (endsNL) lines = lines.slice(0, -1);
    lines.reverse();
    ctx.out(lines.join("\n") + (lines.length ? "\n" : ""));
    return code;
  },
};

const clear: Command = {
  name: "clear",
  summary: "画面をクリア",
  run(ctx) {
    ctx.out("\x1b[2J\x1b[3J\x1b[H");
    return 0;
  },
};

/** printf 変換指定子を幅・精度・フラグ付きで整形する。 */
function fmtConv(
  flags: string,
  width: number,
  prec: number | null,
  conv: string,
  raw: string,
): string {
  const left = flags.includes("-");
  const zero = flags.includes("0") && !left;
  const plus = flags.includes("+");
  const space = flags.includes(" ");
  let body = "";
  let sign = "";
  const isNum = "diouxXfeg".includes(conv);
  if (conv === "s") {
    body = prec != null ? raw.slice(0, prec) : raw;
  } else if (conv === "c") {
    body = raw.slice(0, 1);
  } else if (conv === "d" || conv === "i") {
    let n = parseInt(raw, 10);
    if (!Number.isFinite(n)) n = 0;
    sign = n < 0 ? "-" : plus ? "+" : space ? " " : "";
    let digits = Math.abs(n).toString();
    if (prec != null) digits = digits.padStart(prec, "0");
    body = digits;
  } else if (conv === "o" || conv === "x" || conv === "X") {
    let n = parseInt(raw, 10);
    if (!Number.isFinite(n)) n = 0;
    let digits = Math.abs(n).toString(conv === "o" ? 8 : 16);
    if (conv === "X") digits = digits.toUpperCase();
    if (prec != null) digits = digits.padStart(prec, "0");
    body = digits;
  } else if (conv === "f" || conv === "e" || conv === "g") {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    sign = n < 0 ? "-" : plus ? "+" : space ? " " : "";
    const p = prec == null ? 6 : prec;
    const abs = Math.abs(n);
    body = conv === "f" ? abs.toFixed(p) : conv === "e" ? abs.toExponential(p) : String(abs);
  } else {
    body = raw;
  }
  let full = sign + body;
  if (full.length < width) {
    const pad = width - full.length;
    if (left) full = full + " ".repeat(pad);
    else if (zero && isNum) full = sign + "0".repeat(pad) + body;
    else full = " ".repeat(pad) + full;
  }
  return full;
}

const printf: Command = {
  name: "printf",
  summary: "書式に従って表示",
  run(ctx) {
    const fmt = ctx.args[1];
    if (fmt === undefined) {
      ctx.err("printf: usage: printf format [arguments]\n");
      return 1;
    }
    const args = ctx.args.slice(2);
    let ai = 0;
    let out = "";
    const renderOnce = (): boolean => {
      let used = false;
      let i = 0;
      while (i < fmt.length) {
        const c = fmt[i];
        if (c === "\\") {
          const nx = fmt[i + 1];
          out += ESC[nx] ?? nx ?? "\\";
          i += 2;
          continue;
        }
        if (c === "%") {
          const m = /^%([-+ 0]*)(\d*)(?:\.(\d*))?([sdioxXcfeg%])/.exec(fmt.slice(i));
          if (m) {
            const conv = m[4];
            if (conv === "%") out += "%";
            else {
              used = true;
              const a = args[ai++] ?? "";
              const width = m[2] ? parseInt(m[2], 10) : 0;
              const prec = m[3] === undefined ? null : m[3] === "" ? 0 : parseInt(m[3], 10);
              out += fmtConv(m[1], width, prec, conv, a);
            }
            i += m[0].length;
            continue;
          }
        }
        out += c;
        i++;
      }
      return used;
    };
    do {
      const used = renderOnce();
      if (!used) break;
    } while (ai < args.length);
    ctx.out(out);
    return 0;
  },
};

export const textCommands: Command[] = [echo, cat, tac, clear, printf];
