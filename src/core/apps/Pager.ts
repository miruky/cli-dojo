import type { TerminalView } from "../terminal/TerminalView";
import { clipAnsi, padAnsi, stripAnsi } from "./util";

export interface PagerOptions {
  term: TerminalView;
  /** 表示テキスト (ANSI 色を含んでよい)。 */
  text: string;
  /** ステータスバーに出す名前。 */
  title: string;
  onExit: () => void;
}

/**
 * less 互換のページャ。man / less / more から使う。
 * j/k/矢印/Space/b/d/u/g/G スクロール、/ 検索 + n/N、q 終了。
 */
export class PagerApp {
  private term: TerminalView;
  private title: string;
  private onExit: () => void;
  private lines: string[];
  private top = 0;
  private search = "";
  private searchInput: string | null = null;
  private status = "";
  private done = false;

  constructor(opts: PagerOptions) {
    this.term = opts.term;
    this.title = opts.title;
    this.onExit = opts.onExit;
    const text = opts.text.replace(/\r\n/g, "\n").replace(/\t/g, "        ");
    const lines = text.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    this.lines = lines.length ? lines : [""];
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l");
    this.render();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.clampTop();
    this.render();
  }

  private rowsBody(): number {
    return Math.max(1, this.term.rows - 1);
  }

  private clampTop(): void {
    const max = Math.max(0, this.lines.length - this.rowsBody());
    if (this.top > max) this.top = max;
    if (this.top < 0) this.top = 0;
  }

  onData(data: string): void {
    if (this.searchInput != null) {
      this.onSearchInput(data);
      return;
    }
    switch (data) {
      case "q":
      case "Q":
      case "\x03": // Ctrl-C
        this.quit();
        return;
      case "j":
      case "\x1b[B":
      case "\r":
        this.top++;
        break;
      case "k":
      case "\x1b[A":
        this.top--;
        break;
      case " ":
      case "f":
      case "\x06": // Ctrl-F
      case "\x1b[6~": // PgDn
        this.top += this.rowsBody();
        break;
      case "b":
      case "\x02": // Ctrl-B
      case "\x1b[5~": // PgUp
        this.top -= this.rowsBody();
        break;
      case "d":
      case "\x04":
        this.top += Math.floor(this.rowsBody() / 2);
        break;
      case "u":
      case "\x15":
        this.top -= Math.floor(this.rowsBody() / 2);
        break;
      case "g":
      case "<":
      case "\x1b[H":
        this.top = 0;
        break;
      case "G":
      case ">":
      case "\x1b[F":
        this.top = this.lines.length;
        break;
      case "/":
        this.searchInput = "";
        this.render();
        return;
      case "n":
        this.findNext(1);
        break;
      case "N":
        this.findNext(-1);
        break;
      default:
        return;
    }
    this.status = "";
    this.clampTop();
    this.render();
  }

  private onSearchInput(data: string): void {
    if (data === "\r") {
      const q = this.searchInput ?? "";
      this.searchInput = null;
      if (q !== "") {
        this.search = q;
        this.findNext(1, true);
      }
      this.render();
      return;
    }
    if (data === "\x1b" || data === "\x03" || data === "\x07") {
      this.searchInput = null;
      this.render();
      return;
    }
    if (data === "\x7f" || data === "\b") {
      this.searchInput = (this.searchInput ?? "").slice(0, -1);
      this.render();
      return;
    }
    if (data >= " " && !data.startsWith("\x1b")) {
      this.searchInput += data;
      this.render();
    }
  }

  private findNext(dir: 1 | -1, includeCurrent = false): void {
    if (!this.search) {
      this.status = "(検索パターンなし)";
      this.render();
      return;
    }
    const q = this.search.toLowerCase();
    const n = this.lines.length;
    let i = this.top + (includeCurrent ? 0 : dir);
    for (let step = 0; step < n; step++, i += dir) {
      if (i < 0 || i >= n) break;
      if (stripAnsi(this.lines[i]).toLowerCase().includes(q)) {
        this.top = i;
        this.clampTop();
        this.status = "";
        this.render();
        return;
      }
    }
    this.status = `パターンが見つかりません: ${this.search}`;
    this.render();
  }

  private quit(): void {
    this.dispose();
    this.onExit();
  }

  private highlight(line: string): string {
    if (!this.search) return line;
    const plain = stripAnsi(line);
    const idx = plain.toLowerCase().indexOf(this.search.toLowerCase());
    if (idx < 0) return line;
    // 色付き行に厳密適用するのは重いので、ヒット行は素のテキストへ反転を埋め込む
    return (
      plain.slice(0, idx) +
      "\x1b[7m" + plain.slice(idx, idx + this.search.length) + "\x1b[27m" +
      plain.slice(idx + this.search.length)
    );
  }

  private render(): void {
    const t = this.term.term;
    const cols = this.term.cols;
    const body = this.rowsBody();
    let buf = "\x1b[H";
    for (let r = 0; r < body; r++) {
      const i = this.top + r;
      const line = i < this.lines.length ? this.highlight(this.lines[i]) : "\x1b[38;2;100;108;130m~\x1b[0m";
      buf += clipAnsi(line, cols) + "\x1b[K\r\n";
    }
    // ステータスバー (反転)
    let bar: string;
    if (this.searchInput != null) {
      bar = "/" + this.searchInput;
    } else {
      const last = Math.min(this.lines.length, this.top + body);
      const pct = this.lines.length <= body ? 100 : Math.floor((last / this.lines.length) * 100);
      const end = last >= this.lines.length ? " (END)" : ` ${pct}%`;
      bar = ` ${this.title}  ${this.top + 1}-${last}/${this.lines.length}${end}` +
        (this.status ? `  ${this.status}` : "") +
        "  [q:終了 /:検索 n/N Space/b j/k g/G]";
    }
    buf += "\x1b[7m" + padAnsi(bar, cols) + "\x1b[0m";
    t.write(buf);
  }
}
