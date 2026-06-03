import type { VNode } from "../../vfs/VFS";
import { stringWidth } from "../../terminal/wcwidth";

export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  rest: string[];
}

/** 短/長オプションの簡易パーサ。-la は l,a に分解。--name=val は values へ。 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  let noMore = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (noMore) {
      rest.push(a);
      continue;
    }
    if (a === "--") {
      noMore = true;
      continue;
    }
    if (a === "-") {
      rest.push(a);
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) values.set(a.slice(2, eq), a.slice(eq + 1));
      else flags.add(a.slice(2));
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      for (let k = 1; k < a.length; k++) flags.add(a[k]);
      continue;
    }
    rest.push(a);
  }
  return { flags, values, rest };
}

/** ls 風の色付け (tty のときのみ)。 */
export function colorFor(node: VNode, name: string, tty: boolean): string {
  if (!tty) return name;
  if (node.type === "dir") return `\x1b[1;34m${name}\x1b[0m`;
  if (node.type === "symlink") return `\x1b[1;36m${name}\x1b[0m`;
  if (node.mode & 0o111) return `\x1b[1;32m${name}\x1b[0m`;
  return name;
}

/** ls -F の分類サフィックス。 */
export function classify(node: VNode): string {
  if (node.type === "dir") return "/";
  if (node.type === "symlink") return "@";
  if (node.mode & 0o111) return "*";
  return "";
}

/** 列レイアウト (column-major, ls 既定相当)。 */
export function formatColumns(
  items: Array<{ text: string; w: number }>,
  cols: number,
): string {
  if (items.length === 0) return "";
  const gap = 2;
  const colW = Math.max(...items.map((i) => i.w)) + gap;
  const nCols = Math.max(1, Math.floor((cols + gap) / colW));
  if (nCols <= 1) return items.map((i) => i.text).join("\n");
  const nRows = Math.ceil(items.length / nCols);
  const lines: string[] = [];
  for (let r = 0; r < nRows; r++) {
    let line = "";
    for (let c = 0; c < nCols; c++) {
      const idx = c * nRows + r;
      if (idx >= items.length) break;
      const it = items[idx];
      line += it.text + " ".repeat(Math.max(0, colW - it.w));
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

export function visibleWidth(s: string): number {
  return stringWidth(s);
}
