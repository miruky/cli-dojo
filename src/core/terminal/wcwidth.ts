/** 端末セル幅 (East Asian Width 近似)。行折返し計算とカーソル位置に使う。 */

type Range = [number, number];

function inRange(cp: number, ranges: Range[]): boolean {
  for (const [a, b] of ranges) if (cp >= a && cp <= b) return true;
  return false;
}

// 結合文字 (幅0) の代表的レンジ
const COMBINING: Range[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x06d6, 0x06dc],
  [0x0e31, 0x0e31],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
];

// 全角 (幅2) の代表的レンジ
const WIDE: Range[] = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1b000, 0x1b16f],
  [0x1f200, 0x1f2ff],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

export function codeWidth(cp: number): number {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (inRange(cp, COMBINING)) return 0;
  if (inRange(cp, WIDE)) return 2;
  return 1;
}

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0);
  return cp == null ? 0 : codeWidth(cp);
}

export function stringWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}
