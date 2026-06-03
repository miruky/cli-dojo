import type { VNode } from "./VFS";

const encoder = new TextEncoder();

/** rwxr-xr-x 形式のパーミッション文字列 (先頭にタイプ文字)。 */
export function permString(node: VNode): string {
  const t = node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-";
  const m = node.mode;
  const rwx = (bits: number): string =>
    (bits & 4 ? "r" : "-") + (bits & 2 ? "w" : "-") + (bits & 1 ? "x" : "-");
  return t + rwx((m >> 6) & 7) + rwx((m >> 3) & 7) + rwx(m & 7);
}

/** ls -lh 用の人間可読サイズ。 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T", "P"];
  let n = bytes;
  let u = -1;
  do {
    n /= 1024;
    u++;
  } while (n >= 1024 && u < units.length - 1);
  return (n < 10 ? n.toFixed(1) : Math.round(n).toString()) + units[u];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ls -l の時刻列 ("Mon DD HH:MM" または半年以上前は年表示)。 */
export function lsTime(d: Date, now: Date = new Date()): string {
  const mon = MONTHS[d.getMonth()];
  const day = String(d.getDate()).padStart(2, " ");
  const sixMonths = 1000 * 60 * 60 * 24 * 182;
  if (Math.abs(now.getTime() - d.getTime()) > sixMonths) {
    return `${mon} ${day}  ${d.getFullYear()}`;
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mon} ${day} ${hh}:${mm}`;
}

/** ファイルサイズ (dir=4096, symlink=ターゲット長, file=UTF-8 バイト数)。 */
export function fileSize(node: VNode): number {
  if (node.type === "dir") return 4096;
  if (node.type === "symlink") return node.target.length;
  return encoder.encode(node.content).length;
}

export function lineCount(content: string): number {
  if (content === "") return 0;
  let n = 0;
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") n++;
  if (!content.endsWith("\n")) n++;
  return n;
}
