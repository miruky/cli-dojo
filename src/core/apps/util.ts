/** 全画面 TUI アプリ共通のヘルパ。ANSI 色付き文字列の幅処理など。 */
import { charWidth } from "../terminal/wcwidth";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

/** 表示幅を数える (ANSI を無視し全角=2)。 */
export function visibleWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch);
  return w;
}

/** ANSI を保ったまま表示幅 width で切り詰める。 */
export function clipAnsi(s: string, width: number): string {
  let out = "";
  let w = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\x1b") {
      const m = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(s.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    const cp = s.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const cw = charWidth(ch);
    if (w + cw > width) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  return out + "\x1b[0m";
}

/** 表示幅 width まで右側を空白で埋める (はみ出しは切り詰め)。 */
export function padAnsi(s: string, width: number): string {
  const clipped = clipAnsi(s, width);
  const w = visibleWidth(clipped);
  return clipped + " ".repeat(Math.max(0, width - w));
}
