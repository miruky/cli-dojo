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
          const m = /^%[-+ 0]*\d*(?:\.\d+)?([sdioxXc%])/.exec(fmt.slice(i));
          if (m) {
            const conv = m[1];
            if (conv === "%") out += "%";
            else {
              used = true;
              const a = args[ai++] ?? "";
              if (conv === "d" || conv === "i") out += String(parseInt(a, 10) || 0);
              else if (conv === "x") out += (parseInt(a, 10) || 0).toString(16);
              else if (conv === "X") out += (parseInt(a, 10) || 0).toString(16).toUpperCase();
              else if (conv === "o") out += (parseInt(a, 10) || 0).toString(8);
              else if (conv === "c") out += a.slice(0, 1);
              else out += a;
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
