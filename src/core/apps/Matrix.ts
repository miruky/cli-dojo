import type { TerminalView } from "../terminal/TerminalView";

export interface MatrixOptions {
  term: TerminalView;
  onExit: () => void;
}

interface Drop {
  /** 雨の先頭行 (画面外上から始まる) */
  head: number;
  len: number;
  speed: number; // 1 tick に進む確率
  chars: string[];
}

const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFZ*+:=.<>";

/** cmatrix 風のデジタルレイン。q / Esc / Ctrl-C で終了。 */
export class MatrixApp {
  private term: TerminalView;
  private onExit: () => void;
  private timer: number | null = null;
  private drops: Drop[] = [];
  private done = false;

  constructor(opts: MatrixOptions) {
    this.term = opts.term;
    this.onExit = opts.onExit;
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l\x1b[2J");
    this.reset();
    this.timer = window.setInterval(() => this.tick(), 80);
  }

  dispose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.term.term.write("\x1b[2J");
    this.reset();
  }

  onData(data: string): void {
    if (data === "q" || data === "\x1b" || data === "\x03") {
      this.dispose();
      this.onExit();
    }
  }

  private reset(): void {
    const cols = this.term.cols;
    const rows = this.term.rows;
    this.drops = [];
    for (let c = 0; c < cols; c += 2) {
      this.drops.push(this.newDrop(c, rows, true));
    }
  }

  private newDrop(_col: number, rows: number, scatter: boolean): Drop {
    const len = 4 + Math.floor(Math.random() * (rows * 0.7));
    return {
      head: scatter ? Math.floor(Math.random() * rows * 2) - rows : -Math.floor(Math.random() * rows),
      len,
      speed: 0.4 + Math.random() * 0.6,
      chars: Array.from({ length: rows + 2 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]),
    };
  }

  private tick(): void {
    const t = this.term.term;
    const rows = this.term.rows;
    let buf = "";
    for (let i = 0; i < this.drops.length; i++) {
      const dr = this.drops[i];
      const col = i * 2 + 1; // 1-origin、全角グリフのため 2 桁間隔
      if (Math.random() > dr.speed) continue;
      dr.head++;
      const head = dr.head;
      const tail = head - dr.len;
      // ランダムに文字を揺らす
      if (Math.random() < 0.3) {
        const r = Math.floor(Math.random() * dr.chars.length);
        dr.chars[r] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      if (head >= 1 && head <= rows) {
        buf += `\x1b[${head};${col}H\x1b[1m\x1b[38;2;220;255;220m${dr.chars[head % dr.chars.length]}\x1b[0m`;
      }
      const mid = head - 1;
      if (mid >= 1 && mid <= rows) {
        buf += `\x1b[${mid};${col}H\x1b[38;2;80;250;100m${dr.chars[mid % dr.chars.length]}\x1b[0m`;
      }
      const dimRow = head - Math.floor(dr.len / 2);
      if (dimRow >= 1 && dimRow <= rows) {
        buf += `\x1b[${dimRow};${col}H\x1b[38;2;30;150;50m${dr.chars[dimRow % dr.chars.length]}\x1b[0m`;
      }
      if (tail >= 1 && tail <= rows) {
        buf += `\x1b[${tail};${col}H `;
      }
      if (tail > rows) {
        this.drops[i] = this.newDrop(col - 1, rows, false);
      }
    }
    if (buf) t.write(buf);
  }
}
