/** ANSI エスケープの薄いヘルパ群。truecolor 指定で Cobalt 系に合わせる。 */
export const RESET = "\x1b[0m";

// SGR (色) エスケープを除去して可視幅計算に使う
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

export const fg = (r: number, g: number, b: number, s: string): string =>
  `\x1b[38;2;${r};${g};${b}m${s}${RESET}`;

export const yellow = (s: string): string => fg(255, 198, 0, s);
export const green = (s: string): string => fg(58, 217, 0, s);
export const blue = (s: string): string => fg(0, 136, 255, s);
export const cyan = (s: string): string => fg(24, 179, 199, s);
export const magenta = (s: string): string => fg(251, 148, 255, s);
export const red = (s: string): string => fg(255, 98, 140, s);
export const dim = (s: string): string => fg(138, 147, 173, s);
export const bold = (s: string): string => `\x1b[1m${s}${RESET}`;
