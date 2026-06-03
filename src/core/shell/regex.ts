/**
 * POSIX BRE/ERE を JavaScript の正規表現へ変換する。
 * grep / sed / awk / find -regex などで共有。
 */

const POSIX_CLASS: Record<string, string> = {
  alpha: "A-Za-z",
  digit: "0-9",
  alnum: "A-Za-z0-9",
  upper: "A-Z",
  lower: "a-z",
  space: "\\s",
  blank: " \\t",
  punct: "!-/:-@\\[-`{-~",
  xdigit: "0-9A-Fa-f",
  cntrl: "\\x00-\\x1f\\x7f",
  print: "\\x20-\\x7e",
  graph: "\\x21-\\x7e",
  word: "A-Za-z0-9_",
};

function replacePosixClasses(p: string): string {
  return p.replace(/\[:(\^?)(\w+):\]/g, (_, neg: string, cls: string) => {
    const repl = POSIX_CLASS[cls];
    return repl ? (neg ? "^" + repl : repl) : "";
  });
}

/** BRE を ERE 相当へ変換 (ブラケット式の外で metachar の意味を反転)。 */
function breToEre(p: string): string {
  let out = "";
  let i = 0;
  let inClass = false;
  while (i < p.length) {
    const c = p[i];
    if (inClass) {
      out += c;
      if (c === "]") inClass = false;
      i++;
      continue;
    }
    if (c === "[") {
      inClass = true;
      out += c;
      // 直後の ^ と ] はリテラル
      if (p[i + 1] === "^") {
        out += "^";
        i++;
      }
      if (p[i + 1] === "]") {
        out += "]";
        i++;
      }
      i++;
      continue;
    }
    if (c === "\\") {
      const n = p[i + 1];
      if (n === "(" || n === ")" || n === "{" || n === "}" || n === "+" || n === "?" || n === "|") {
        out += n; // \( → ( など (ERE では特殊)
        i += 2;
        continue;
      }
      out += c + (n ?? "");
      i += 2;
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}" || c === "+" || c === "?" || c === "|") {
      out += "\\" + c; // BRE では素の ( ) { } + ? | はリテラル
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export interface RegexOptions {
  extended?: boolean; // ERE (grep -E)
  ignoreCase?: boolean;
  global?: boolean;
  multiline?: boolean;
  wholeWord?: boolean; // grep -w
  wholeLine?: boolean; // grep -x
  fixed?: boolean; // 固定文字列 (grep -F)
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** パターンを JS の正規表現ソースへ変換。 */
export function toJsRegexSource(pattern: string, opts: RegexOptions = {}): string {
  let src: string;
  if (opts.fixed) {
    src = escapeLiteral(pattern);
  } else {
    src = replacePosixClasses(pattern);
    src = src.replace(/\\</g, "\\b").replace(/\\>/g, "\\b");
    if (!opts.extended) src = breToEre(src);
  }
  if (opts.wholeWord) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
  if (opts.wholeLine) src = `^(?:${src})$`;
  return src;
}

export function makeRegex(pattern: string, opts: RegexOptions = {}): RegExp {
  const src = toJsRegexSource(pattern, opts);
  let flags = "";
  if (opts.global) flags += "g";
  if (opts.ignoreCase) flags += "i";
  if (opts.multiline) flags += "m";
  return new RegExp(src, flags);
}

/** 入力テキストを行配列へ (末尾改行は落とす)。 */
export function toLines(text: string): string[] {
  if (text === "") return [];
  const endsNL = text.endsWith("\n");
  const lines = text.split("\n");
  if (endsNL) lines.pop();
  return lines;
}
