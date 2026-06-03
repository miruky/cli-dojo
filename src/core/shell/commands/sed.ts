import type { Command, ExecContext } from "../types";
import { makeRegex } from "../regex";

/** sed: ストリームエディタ。s/y/p/d/n/N/hold/分岐/{} と各種アドレスに対応。 */

type AddrType = "line" | "last" | "regex" | "step";
interface Address {
  type: AddrType;
  line?: number;
  step?: number;
  re?: RegExp;
}

interface Instr {
  name: string;
  a1?: Address;
  a2?: Address;
  negate: boolean;
  // s
  re?: RegExp;
  replacement?: string;
  sGlobal?: boolean;
  sNth?: number;
  sPrint?: boolean;
  // y
  yFrom?: string;
  yTo?: string;
  // text (a/i/c) / filename (r)
  text?: string;
  // label / branch
  label?: string;
  // block
  blockEnd?: number;
  // 範囲の状態
  rangeActive?: boolean;
}

interface ParseResult {
  prog: Instr[];
  labels: Map<string, number>;
  error?: string;
}

function unescapeText(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

class ScriptParser {
  private i = 0;
  constructor(private s: string, private extended: boolean) {}

  parse(): ParseResult {
    const prog: Instr[] = [];
    const labels = new Map<string, number>();
    const blockStack: number[] = [];
    const n = this.s.length;
    while (this.i < n) {
      this.skipSep();
      if (this.i >= n) break;
      const a1 = this.parseAddress();
      let a2: Address | undefined;
      if (a1 && this.s[this.i] === ",") {
        this.i++;
        this.skipWs();
        a2 = this.parseAddress();
      }
      this.skipWs();
      let negate = false;
      while (this.s[this.i] === "!") {
        negate = !negate;
        this.i++;
        this.skipWs();
      }
      const cmd = this.s[this.i];
      if (cmd === undefined) break;

      if (cmd === "{") {
        this.i++;
        prog.push({ name: "{", a1, a2, negate, blockEnd: -1 });
        blockStack.push(prog.length - 1);
        continue;
      }
      if (cmd === "}") {
        this.i++;
        const start = blockStack.pop();
        if (start != null) prog[start].blockEnd = prog.length;
        prog.push({ name: "}", negate: false });
        continue;
      }
      if (cmd === "s") {
        this.i++;
        const ins = this.parseS(a1, a2, negate);
        if (typeof ins === "string") return { prog, labels, error: ins };
        prog.push(ins);
        continue;
      }
      if (cmd === "y") {
        this.i++;
        const ins = this.parseY(a1, a2, negate);
        if (typeof ins === "string") return { prog, labels, error: ins };
        prog.push(ins);
        continue;
      }
      if (cmd === "a" || cmd === "i" || cmd === "c") {
        this.i++;
        const text = this.parseText();
        prog.push({ name: cmd, a1, a2, negate, text });
        continue;
      }
      if (cmd === "r" || cmd === "w" || cmd === "R" || cmd === "W") {
        this.i++;
        this.skipWs();
        prog.push({ name: cmd, a1, a2, negate, text: this.readToLineEnd().trim() });
        continue;
      }
      if (cmd === ":") {
        this.i++;
        const label = this.readLabel();
        labels.set(label, prog.length);
        prog.push({ name: ":", negate: false, label });
        continue;
      }
      if (cmd === "b" || cmd === "t" || cmd === "T") {
        this.i++;
        this.skipWs();
        const label = this.readLabel();
        prog.push({ name: cmd, a1, a2, negate, label });
        continue;
      }
      if ("pPdDnN=lhHgGxqQz".includes(cmd)) {
        this.i++;
        // q/Q の終了コードは無視
        if ((cmd === "q" || cmd === "Q") && /\d/.test(this.s[this.i] ?? "")) this.readLabel();
        prog.push({ name: cmd, a1, a2, negate });
        continue;
      }
      return { prog, labels, error: `sed: 不明なコマンド: \`${cmd}'` };
    }
    return { prog, labels };
  }

  private skipWs(): void {
    while (this.s[this.i] === " " || this.s[this.i] === "\t") this.i++;
  }
  private skipSep(): void {
    while (this.i < this.s.length && /[\s;]/.test(this.s[this.i])) this.i++;
  }
  private readLabel(): string {
    let l = "";
    while (this.i < this.s.length && !/[;\n}]/.test(this.s[this.i])) l += this.s[this.i++];
    return l.trim();
  }
  private readToLineEnd(): string {
    let t = "";
    while (this.i < this.s.length && this.s[this.i] !== "\n") t += this.s[this.i++];
    return t;
  }

  private parseText(): string {
    // `a\` 改行形式 と GNU 一行形式 `a text` の両対応
    let i = this.i;
    if (this.s[i] === "\\") {
      i++;
      if (this.s[i] === "\n") i++;
    } else {
      while (this.s[i] === " " || this.s[i] === "\t") i++;
    }
    let text = "";
    while (i < this.s.length) {
      const c = this.s[i];
      if (c === "\\" && this.s[i + 1] === "\n") {
        text += "\n";
        i += 2;
        continue;
      }
      if (c === "\\" && i + 1 < this.s.length) {
        text += this.s[i + 1];
        i += 2;
        continue;
      }
      if (c === "\n") break;
      text += c;
      i++;
    }
    this.i = i;
    return text;
  }

  private readDelimited(delim: string): string {
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === "\\" && this.s[this.i + 1] === delim) {
        out += delim;
        this.i += 2;
        continue;
      }
      if (c === "\\") {
        out += "\\" + (this.s[this.i + 1] ?? "");
        this.i += 2;
        continue;
      }
      if (c === delim) {
        this.i++;
        return out;
      }
      out += c;
      this.i++;
    }
    return out;
  }

  private parseAddress(): Address | undefined {
    this.skipWs();
    const c = this.s[this.i];
    if (c === undefined) return undefined;
    if (/\d/.test(c)) {
      let num = "";
      while (/\d/.test(this.s[this.i] ?? "")) num += this.s[this.i++];
      if (this.s[this.i] === "~") {
        this.i++;
        let step = "";
        while (/\d/.test(this.s[this.i] ?? "")) step += this.s[this.i++];
        return { type: "step", line: parseInt(num, 10), step: parseInt(step, 10) || 1 };
      }
      return { type: "line", line: parseInt(num, 10) };
    }
    if (c === "$") {
      this.i++;
      return { type: "last" };
    }
    if (c === "/" || c === "\\") {
      let delim = "/";
      if (c === "\\") {
        delim = this.s[this.i + 1];
        this.i += 2;
      } else this.i++;
      const src = this.readDelimited(delim);
      let ic = false;
      while (this.s[this.i] === "I" || this.s[this.i] === "M") {
        if (this.s[this.i] === "I") ic = true;
        this.i++;
      }
      return { type: "regex", re: makeRegex(src, { extended: this.extended, ignoreCase: ic }) };
    }
    return undefined;
  }

  private parseS(a1: Address | undefined, a2: Address | undefined, negate: boolean): Instr | string {
    const delim = this.s[this.i];
    if (!delim) return "sed: s コマンドが不正です";
    this.i++;
    const reSrc = this.readDelimited(delim);
    const replacement = this.readDelimited(delim);
    // flags
    let global = false;
    let nth = 0;
    let print = false;
    let ic = false;
    let multiline = false;
    while (this.i < this.s.length) {
      const f = this.s[this.i];
      if (f === "g") global = true;
      else if (f === "p") print = true;
      else if (f === "i" || f === "I") ic = true;
      else if (f === "m" || f === "M") multiline = true;
      else if (/\d/.test(f)) {
        let num = "";
        while (/\d/.test(this.s[this.i] ?? "")) num += this.s[this.i++];
        nth = parseInt(num, 10);
        continue;
      } else break;
      this.i++;
    }
    let re: RegExp;
    try {
      re = makeRegex(reSrc, { extended: this.extended, ignoreCase: ic, global: true, multiline });
    } catch {
      return `sed: 不正な正規表現: ${reSrc}`;
    }
    return { name: "s", a1, a2, negate, re, replacement, sGlobal: global, sNth: nth, sPrint: print };
  }

  private parseY(a1: Address | undefined, a2: Address | undefined, negate: boolean): Instr | string {
    const delim = this.s[this.i];
    if (!delim) return "sed: y コマンドが不正です";
    this.i++;
    const from = unescapeText(this.readDelimited(delim));
    const to = unescapeText(this.readDelimited(delim));
    if (from.length !== to.length) return "sed: y の文字列長が一致しません";
    return { name: "y", a1, a2, negate, yFrom: from, yTo: to };
  }
}

function applyReplacement(m: RegExpExecArray, replacement: string): string {
  let result = "";
  let upper = false;
  let lower = false;
  let nextUpper = false;
  let nextLower = false;
  const emit = (s: string): void => {
    for (const ch of s) {
      let c = ch;
      if (nextUpper) {
        c = ch.toUpperCase();
        nextUpper = false;
      } else if (nextLower) {
        c = ch.toLowerCase();
        nextLower = false;
      } else if (upper) c = ch.toUpperCase();
      else if (lower) c = ch.toLowerCase();
      result += c;
    }
  };
  for (let i = 0; i < replacement.length; i++) {
    const c = replacement[i];
    if (c === "\\") {
      const nch = replacement[i + 1];
      i++;
      if (nch >= "1" && nch <= "9") emit(m[Number(nch)] ?? "");
      else if (nch === "n") emit("\n");
      else if (nch === "t") emit("\t");
      else if (nch === "&") emit("&");
      else if (nch === "\\") emit("\\");
      else if (nch === "L") {
        lower = true;
        upper = false;
      } else if (nch === "U") {
        upper = true;
        lower = false;
      } else if (nch === "E") {
        upper = false;
        lower = false;
      } else if (nch === "l") nextLower = true;
      else if (nch === "u") nextUpper = true;
      else emit(nch ?? "");
    } else if (c === "&") emit(m[0]);
    else emit(c);
  }
  return result;
}

function doSub(pattern: string, ins: Instr): { result: string; changed: boolean } {
  const re = ins.re!;
  re.lastIndex = 0;
  const global = ins.sGlobal;
  const nth = ins.sNth ?? 0;
  let result = "";
  let last = 0;
  let count = 0;
  let changed = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    count++;
    const shouldReplace = global ? (nth ? count >= nth : true) : nth ? count === nth : count === 1;
    if (shouldReplace) {
      result += pattern.slice(last, m.index) + applyReplacement(m, ins.replacement ?? "");
      last = m.index + m[0].length;
      changed = true;
    }
    if (m[0] === "") re.lastIndex++;
    if (!global && count >= (nth || 1)) break;
  }
  result += pattern.slice(last);
  return { result, changed };
}

function translit(s: string, from: string, to: string): string {
  let out = "";
  for (const ch of s) {
    const idx = from.indexOf(ch);
    out += idx >= 0 ? to[idx] : ch;
  }
  return out;
}

function listFormat(s: string): string {
  return (
    s.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "") + "$"
  );
}

export const sed: Command = {
  name: "sed",
  summary: "ストリームエディタ (s///g, アドレス, hold, 分岐)",
  run(ctx: ExecContext) {
    const args = ctx.args;
    let extended = false;
    let suppress = false;
    let inPlace = false;
    let separate = false;
    const scripts: string[] = [];
    const files: string[] = [];
    let scriptTaken = false;
    let i = 1;
    while (i < args.length) {
      const a = args[i];
      if (a === "--") {
        for (let k = i + 1; k < args.length; k++) files.push(args[k]);
        break;
      }
      if (a === "-n" || a === "--quiet" || a === "--silent") suppress = true;
      else if (a === "-r" || a === "-E" || a === "--regexp-extended") extended = true;
      else if (a === "-s" || a === "--separate") separate = true;
      else if (a === "-i" || a.startsWith("-i") || a === "--in-place" || a.startsWith("--in-place")) {
        inPlace = true;
        suppress = suppress; // 出力は書き戻し
      } else if (a === "-e" || a === "--expression") {
        scripts.push(args[++i] ?? "");
        scriptTaken = true;
      } else if (a.startsWith("-e")) {
        scripts.push(a.slice(2));
        scriptTaken = true;
      } else if (a === "-f" || a === "--file") {
        const node = ctx.vfs.stat(ctx.resolve(args[++i] ?? ""));
        if (node && node.type === "file") scripts.push(node.content);
        scriptTaken = true;
      } else if (a.startsWith("-") && a !== "-") {
        // 未知オプションは無視
      } else if (!scriptTaken) {
        scripts.push(a);
        scriptTaken = true;
      } else files.push(a);
      i++;
    }

    if (scripts.length === 0) {
      ctx.err("usage: sed [-n] [-e script] [-f file] [script] [files...]\n");
      return 1;
    }

    const parsed = new ScriptParser(scripts.join("\n"), extended).parse();
    if (parsed.error) {
      ctx.err(parsed.error + "\n");
      return 1;
    }
    const { prog, labels } = parsed;

    const runSed = (inputLines: string[]): string => {
      let out = "";
      let idx = 0;
      let pattern = "";
      let hold = "";
      let lineNo = 0;
      let quit = false;
      for (const ins of prog) ins.rangeActive = false;

      const addrMatch = (addr: Address): boolean => {
        switch (addr.type) {
          case "line":
            return lineNo === addr.line;
          case "last":
            return idx >= inputLines.length;
          case "regex":
            return addr.re!.test(pattern);
          case "step":
            return (
              (addr.step ?? 0) > 0 &&
              lineNo >= (addr.line ?? 0) &&
              (lineNo - (addr.line ?? 0)) % (addr.step ?? 1) === 0
            );
        }
      };
      const matches = (ins: Instr): { matched: boolean; rangeEnd: boolean } => {
        if (!ins.a1) return { matched: !ins.negate ? true : false, rangeEnd: false };
        let matched = false;
        let rangeEnd = false;
        if (!ins.a2) {
          matched = addrMatch(ins.a1);
        } else if (!ins.rangeActive) {
          if (addrMatch(ins.a1)) {
            ins.rangeActive = true;
            matched = true;
            if (ins.a2.type === "line" && (ins.a2.line ?? 0) <= lineNo) {
              ins.rangeActive = false;
              rangeEnd = true;
            }
          }
        } else {
          matched = true;
          if (addrMatch(ins.a2) || (ins.a2.type === "line" && lineNo >= (ins.a2.line ?? 0))) {
            ins.rangeActive = false;
            rangeEnd = true;
          }
        }
        if (ins.negate) matched = !matched;
        return { matched, rangeEnd };
      };

      while (idx < inputLines.length && !quit) {
        pattern = inputLines[idx];
        idx++;
        lineNo++;
        let substituted = false;
        let deleted = false;
        const appendQueue: string[] = [];
        let pc = 0;

        cycle: while (pc < prog.length) {
          const ins = prog[pc];
          if (ins.name === "}" || ins.name === ":") {
            pc++;
            continue;
          }
          const { matched, rangeEnd } = matches(ins);
          if (ins.name === "{") {
            pc = matched ? pc + 1 : (ins.blockEnd ?? prog.length);
            continue;
          }
          if (!matched) {
            pc++;
            continue;
          }
          switch (ins.name) {
            case "s": {
              const r = doSub(pattern, ins);
              if (r.changed) {
                pattern = r.result;
                substituted = true;
                if (ins.sPrint) out += pattern + "\n";
              }
              break;
            }
            case "y":
              pattern = translit(pattern, ins.yFrom ?? "", ins.yTo ?? "");
              break;
            case "p":
              out += pattern + "\n";
              break;
            case "P":
              out += pattern.split("\n")[0] + "\n";
              break;
            case "d":
              deleted = true;
              break cycle;
            case "D": {
              const nlPos = pattern.indexOf("\n");
              if (nlPos < 0) {
                deleted = true;
                break cycle;
              }
              pattern = pattern.slice(nlPos + 1);
              pc = 0;
              continue;
            }
            case "n":
              if (!suppress) out += pattern + "\n";
              if (idx < inputLines.length) {
                pattern = inputLines[idx];
                idx++;
                lineNo++;
              } else {
                deleted = true;
                quit = true;
                break cycle;
              }
              break;
            case "N":
              if (idx < inputLines.length) {
                pattern += "\n" + inputLines[idx];
                idx++;
                lineNo++;
              } else {
                break cycle;
              }
              break;
            case "=":
              out += lineNo + "\n";
              break;
            case "l":
              out += listFormat(pattern) + "\n";
              break;
            case "h":
              hold = pattern;
              break;
            case "H":
              hold = hold + "\n" + pattern;
              break;
            case "g":
              pattern = hold;
              break;
            case "G":
              pattern = pattern + "\n" + hold;
              break;
            case "x": {
              const t = pattern;
              pattern = hold;
              hold = t;
              break;
            }
            case "z":
              pattern = "";
              break;
            case "a":
              appendQueue.push(ins.text ?? "");
              break;
            case "i":
              out += (ins.text ?? "") + "\n";
              break;
            case "c":
              if (!ins.a2 || rangeEnd) out += (ins.text ?? "") + "\n";
              deleted = true;
              break cycle;
            case "r": {
              const node = ctx.vfs.stat(ctx.resolve(ins.text ?? ""));
              if (node && node.type === "file") appendQueue.push(node.content.replace(/\n$/, ""));
              break;
            }
            case "b":
              pc = ins.label ? labels.get(ins.label) ?? prog.length : prog.length;
              continue;
            case "t":
              if (substituted) {
                substituted = false;
                pc = ins.label ? labels.get(ins.label) ?? prog.length : prog.length;
                continue;
              }
              break;
            case "T":
              if (!substituted) {
                pc = ins.label ? labels.get(ins.label) ?? prog.length : prog.length;
                continue;
              }
              break;
            case "q":
              quit = true;
              break cycle;
            case "Q":
              quit = true;
              deleted = true;
              break cycle;
          }
          pc++;
        }

        if (!deleted && !suppress) out += pattern + "\n";
        for (const t of appendQueue) out += t + "\n";
      }
      return out;
    };

    if (inPlace) {
      const targets = files.length ? files : [];
      for (const f of targets) {
        const abs = ctx.resolve(f);
        const node = ctx.vfs.stat(abs);
        if (!node || node.type !== "file") {
          ctx.err(`sed: can't read ${f}: No such file or directory\n`);
          continue;
        }
        const endsNL = node.content.endsWith("\n");
        const lines = node.content.split("\n");
        if (endsNL) lines.pop();
        node.content = runSed(lines);
        node.mtime = new Date();
      }
      return 0;
    }

    // 入力収集
    const allLines: string[] = [];
    if (files.length === 0) {
      const endsNL = ctx.stdin.endsWith("\n");
      const lines = ctx.stdin.split("\n");
      if (endsNL) lines.pop();
      allLines.push(...lines);
    } else {
      for (const f of files) {
        const node = ctx.vfs.stat(ctx.resolve(f));
        if (!node || node.type !== "file") {
          ctx.err(`sed: can't read ${f}: No such file or directory\n`);
          continue;
        }
        const endsNL = node.content.endsWith("\n");
        const lines = node.content.split("\n");
        if (endsNL) lines.pop();
        if (separate) {
          ctx.out(runSed(lines));
        } else allLines.push(...lines);
      }
    }
    if (!separate) ctx.out(runSed(allLines));
    return 0;
  },
};
