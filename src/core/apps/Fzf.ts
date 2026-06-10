import type { TerminalView } from "../terminal/TerminalView";
import { padAnsi } from "./util";

export interface FzfOptions {
  term: TerminalView;
  items: string[];
  /** 確定/キャンセル時に呼ぶ。picked=null はキャンセル。 */
  onDone: (picked: string | null) => void;
}

interface Scored {
  item: string;
  score: number;
  positions: number[];
}

const R = "\x1b[0m";
const CYAN = "\x1b[1m\x1b[38;2;24;179;199m";
const MAGENTA = "\x1b[38;2;251;148;255m";
const DIM = "\x1b[38;2;120;128;150m";
const YELLOW = "\x1b[38;2;255;198;0m";

/** fzf 風ファジーファインダ。タイプで絞り込み、Enter で選択を出力。 */
export class FzfApp {
  private term: TerminalView;
  private items: string[];
  private onDone: (picked: string | null) => void;
  private query = "";
  private cursor = 0; // フィルタ結果内の選択位置
  private filtered: Scored[] = [];
  private done = false;

  constructor(opts: FzfOptions) {
    this.term = opts.term;
    this.items = opts.items;
    this.onDone = opts.onDone;
    this.filter();
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25h\x1b[5 q");
    this.render();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.render();
  }

  onData(data: string): void {
    switch (data) {
      case "\r": {
        const picked = this.filtered[this.cursor]?.item ?? null;
        this.finish(picked);
        return;
      }
      case "\x1b":
      case "\x03":
      case "\x07":
        this.finish(null);
        return;
      case "\x7f":
      case "\b":
        this.query = this.query.slice(0, -1);
        this.filter();
        break;
      case "\x15": // Ctrl-U
        this.query = "";
        this.filter();
        break;
      case "\x1b[A":
      case "\x0b": // Ctrl-K
      case "\x10": // Ctrl-P
        this.cursor = Math.max(0, Math.min(this.filtered.length - 1, this.cursor + 1));
        break;
      case "\x1b[B":
      case "\x0a": // Ctrl-J
      case "\x0e": // Ctrl-N
        this.cursor = Math.max(0, this.cursor - 1);
        break;
      default:
        if (data >= " " && !data.startsWith("\x1b")) {
          this.query += data;
          this.filter();
        } else {
          return;
        }
    }
    this.render();
  }

  private finish(picked: string | null): void {
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
    this.onDone(picked);
  }

  /** fzf 風のサブシーケンスマッチ。連続ボーナス/先頭ボーナス付き。 */
  private fuzzyMatch(query: string, item: string): Scored | null {
    if (!query) return { item, score: 0, positions: [] };
    const q = query.toLowerCase();
    const s = item.toLowerCase();
    const positions: number[] = [];
    let qi = 0;
    let score = 0;
    let streak = 0;
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) {
        positions.push(i);
        streak++;
        score += 10 + streak * 5;
        if (i === 0 || "/._- ".includes(s[i - 1])) score += 20; // 単語境界
        qi++;
      } else {
        streak = 0;
      }
    }
    if (qi < q.length) return null;
    score -= item.length; // 短い候補を優先
    return { item, score, positions };
  }

  private filter(): void {
    const out: Scored[] = [];
    for (const it of this.items) {
      const m = this.fuzzyMatch(this.query, it);
      if (m) out.push(m);
    }
    out.sort((a, b) => b.score - a.score);
    this.filtered = out;
    this.cursor = 0;
  }

  private render(): void {
    const t = this.term.term;
    const rows = this.term.rows;
    const cols = this.term.cols;
    const listRows = rows - 2; // 上: リスト, 下から2行目: カウンタ, 最下: プロンプト
    let buf = "\x1b[H\x1b[?25l";
    // 候補は下から上へ (fzf デフォルトレイアウト)
    for (let r = 0; r < listRows; r++) {
      const idx = listRows - 1 - r; // 画面上の行 r に出す候補 index
      const sc = this.filtered[idx];
      let line = "";
      if (sc) {
        const sel = idx === this.cursor;
        const pointer = sel ? CYAN + "▌" + R : " ";
        const set = new Set(sc.positions);
        let body = "";
        for (let i = 0; i < sc.item.length; i++) {
          body += set.has(i) ? YELLOW + "\x1b[1m" + sc.item[i] + R : sc.item[i];
        }
        line = pointer + " " + (sel ? "\x1b[1m" : "") + body + R;
        if (sel) line = "\x1b[48;2;40;46;66m" + line;
      }
      buf += padAnsi(line, cols) + R + "\r\n";
    }
    buf += padAnsi(`  ${MAGENTA}${this.filtered.length}/${this.items.length}${R} ${DIM}── Enter:確定 Esc:中止 ↑↓:移動${R}`, cols) + "\r\n";
    const prompt = `${CYAN}> ${R}${this.query}`;
    buf += padAnsi(prompt, cols);
    // カーソルをクエリ末尾に置く
    buf += `\x1b[${rows};${3 + this.query.length}H\x1b[?25h`;
    t.write(buf);
  }
}
