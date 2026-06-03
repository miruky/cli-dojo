/** シェルのパーサ。1行を「; && || で連なるパイプライン列」へ構文解析する。 */
export type Quote = "none" | "single" | "double";

export type Frag =
  | { kind: "lit"; text: string; quote: Quote }
  | { kind: "cmdsub"; command: string; quote: "none" | "double" };

export type Word = Frag[];

export type RedirOp = ">" | ">>" | "<" | "2>" | "2>>" | "&>";
export interface Redir {
  op: RedirOp;
  target: Word;
}
export interface Assignment {
  name: string;
  value: Word;
}
export interface SimpleCommand {
  assignments: Assignment[];
  words: Word[];
  redirs: Redir[];
}
export interface Pipeline {
  commands: SimpleCommand[];
}
export type SepOp = "start" | ";" | "&&" | "||";
export interface ListItem {
  op: SepOp;
  pipeline: Pipeline;
}
export type CommandList = ListItem[];

export interface ParseResult {
  list: CommandList;
  error?: string;
}

type Token = { t: "word"; word: Word } | { t: "op"; op: string };

// ---- 字句解析 ----
function readCmdSub(s: string, start: number): { cmd: string; next: number } {
  let i = start;
  let depth = 1;
  let out = "";
  while (i < s.length) {
    const c = s[i];
    if (c === "(") {
      depth++;
      out += c;
      i++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
      out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return { cmd: out, next: i };
}

function readBacktick(s: string, start: number): { cmd: string; next: number } {
  let i = start;
  let out = "";
  while (i < s.length && s[i] !== "`") {
    if (s[i] === "\\" && i + 1 < s.length && "`$\\".includes(s[i + 1])) {
      out += s[i + 1];
      i += 2;
    } else {
      out += s[i];
      i++;
    }
  }
  return { cmd: out, next: i < s.length ? i + 1 : i };
}

function isOpStart(c: string): boolean {
  return c === "|" || c === ";" || c === "<" || c === ">" || c === "&";
}

function readWord(s: string, start: number): { word: Word; next: number } {
  const n = s.length;
  let i = start;
  const frags: Frag[] = [];
  let buf = "";
  let bufQuote: Quote = "none";

  const flush = (): void => {
    if (buf !== "") {
      frags.push({ kind: "lit", text: buf, quote: bufQuote });
      buf = "";
    }
  };

  while (i < n) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n") break;
    if (isOpStart(c)) break;

    if (c === "'") {
      flush();
      bufQuote = "none";
      let j = i + 1;
      let t = "";
      while (j < n && s[j] !== "'") {
        t += s[j];
        j++;
      }
      frags.push({ kind: "lit", text: t, quote: "single" });
      i = j < n ? j + 1 : j;
      continue;
    }

    if (c === '"') {
      flush();
      i++;
      let t = "";
      const flushDouble = (): void => {
        if (t !== "") {
          frags.push({ kind: "lit", text: t, quote: "double" });
          t = "";
        }
      };
      while (i < n && s[i] !== '"') {
        const ch = s[i];
        if (ch === "\\" && i + 1 < n && '"\\$`'.includes(s[i + 1])) {
          flushDouble();
          frags.push({ kind: "lit", text: s[i + 1], quote: "single" });
          i += 2;
          continue;
        }
        if (ch === "$" && s[i + 1] === "(") {
          flushDouble();
          const sub = readCmdSub(s, i + 2);
          frags.push({ kind: "cmdsub", command: sub.cmd, quote: "double" });
          i = sub.next;
          continue;
        }
        if (ch === "`") {
          flushDouble();
          const sub = readBacktick(s, i + 1);
          frags.push({ kind: "cmdsub", command: sub.cmd, quote: "double" });
          i = sub.next;
          continue;
        }
        t += ch;
        i++;
      }
      flushDouble();
      i = i < n ? i + 1 : i;
      continue;
    }

    if (c === "\\" && i + 1 < n) {
      flush();
      frags.push({ kind: "lit", text: s[i + 1], quote: "single" });
      i += 2;
      continue;
    }

    if (c === "$" && s[i + 1] === "(") {
      flush();
      const sub = readCmdSub(s, i + 2);
      frags.push({ kind: "cmdsub", command: sub.cmd, quote: "none" });
      i = sub.next;
      continue;
    }

    if (c === "`") {
      flush();
      const sub = readBacktick(s, i + 1);
      frags.push({ kind: "cmdsub", command: sub.cmd, quote: "none" });
      i = sub.next;
      continue;
    }

    if (buf !== "" && bufQuote !== "none") flush();
    bufQuote = "none";
    buf += c;
    i++;
  }

  flush();
  return { word: frags, next: i };
}

function tokenize(s: string): Token[] {
  const n = s.length;
  const tokens: Token[] = [];
  let i = 0;

  while (i < n) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "\n") {
      tokens.push({ t: "op", op: ";" });
      i++;
      continue;
    }
    if (c === "#") break; // 行コメント

    // fd リダイレクト (1> 2> 1>> 2>>) — 数字がトークン先頭のときのみ
    if ((c === "1" || c === "2") && s[i + 1] === ">") {
      if (s[i + 2] === ">") {
        tokens.push({ t: "op", op: c === "2" ? "2>>" : ">>" });
        i += 3;
      } else {
        tokens.push({ t: "op", op: c === "2" ? "2>" : ">" });
        i += 2;
      }
      continue;
    }

    // 一般オペレータ
    if (c === "&" && s[i + 1] === "&") {
      tokens.push({ t: "op", op: "&&" });
      i += 2;
      continue;
    }
    if (c === "|" && s[i + 1] === "|") {
      tokens.push({ t: "op", op: "||" });
      i += 2;
      continue;
    }
    if (c === ">" && s[i + 1] === ">") {
      tokens.push({ t: "op", op: ">>" });
      i += 2;
      continue;
    }
    if (c === "&" && s[i + 1] === ">") {
      tokens.push({ t: "op", op: "&>" });
      i += 2;
      continue;
    }
    if (c === "|") {
      tokens.push({ t: "op", op: "|" });
      i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ t: "op", op: ";" });
      i++;
      continue;
    }
    if (c === "&") {
      tokens.push({ t: "op", op: ";" }); // バックグラウンドは ; 扱い
      i++;
      continue;
    }
    if (c === "<") {
      tokens.push({ t: "op", op: "<" });
      i++;
      continue;
    }
    if (c === ">") {
      tokens.push({ t: "op", op: ">" });
      i++;
      continue;
    }

    const { word, next } = readWord(s, i);
    tokens.push({ t: "word", word });
    i = next;
  }

  return tokens;
}

// ---- 構文解析 ----
function fragText(f: Frag): string {
  return f.kind === "lit" ? f.text : "";
}

function asAssignment(word: Word): Assignment | null {
  const first = word[0];
  if (!first || first.kind !== "lit" || first.quote !== "none") return null;
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(first.text);
  if (!m) return null;
  const name = m[1];
  const rest = m[2];
  const value: Word = [];
  if (rest !== "") value.push({ kind: "lit", text: rest, quote: "none" });
  for (let i = 1; i < word.length; i++) value.push(word[i]);
  return { name, value };
}

const REDIR_OPS: RedirOp[] = [">", ">>", "<", "2>", "2>>", "&>"];

export function parse(input: string): ParseResult {
  const tokens = tokenize(input);
  const list: CommandList = [];
  let p = 0;

  const parseSimple = (): SimpleCommand => {
    const cmd: SimpleCommand = { assignments: [], words: [], redirs: [] };
    let sawWord = false;
    while (p < tokens.length) {
      const tk = tokens[p];
      if (tk.t === "op") {
        if (tk.op === "|" || tk.op === ";" || tk.op === "&&" || tk.op === "||") break;
        if ((REDIR_OPS as string[]).includes(tk.op)) {
          p++;
          const tgt = tokens[p];
          if (tgt && tgt.t === "word") {
            cmd.redirs.push({ op: tk.op as RedirOp, target: tgt.word });
            p++;
          }
          continue;
        }
        break;
      }
      if (!sawWord) {
        const asg = asAssignment(tk.word);
        if (asg) {
          cmd.assignments.push(asg);
          p++;
          continue;
        }
      }
      sawWord = true;
      cmd.words.push(tk.word);
      p++;
    }
    return cmd;
  };

  const parsePipeline = (): Pipeline => {
    const commands: SimpleCommand[] = [parseSimple()];
    while (p < tokens.length && tokens[p].t === "op" && (tokens[p] as { op: string }).op === "|") {
      p++;
      commands.push(parseSimple());
    }
    return { commands };
  };

  let op: SepOp = "start";
  while (p < tokens.length) {
    // 連続セパレータをスキップ
    if (tokens[p].t === "op") {
      const o = (tokens[p] as { op: string }).op;
      if (o === ";" || o === "&&" || o === "||") {
        p++;
        continue;
      }
    }
    const pipeline = parsePipeline();
    list.push({ op, pipeline });
    if (p < tokens.length && tokens[p].t === "op") {
      const o = (tokens[p] as { op: string }).op;
      if (o === ";") op = ";";
      else if (o === "&&") op = "&&";
      else if (o === "||") op = "||";
      else break;
      p++;
    } else {
      break;
    }
  }

  return { list };
}

export { fragText };
