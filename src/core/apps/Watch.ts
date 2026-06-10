import type { TerminalView } from "../terminal/TerminalView";
import { clipAnsi, padAnsi } from "./util";

export interface WatchOptions {
  term: TerminalView;
  /** 繰り返すコマンド行。 */
  line: string;
  /** 間隔 (秒)。 */
  interval: number;
  /** コマンドを実行し出力を返す (Shell.capture)。 */
  runLine: (line: string) => { output: string; code: number };
  onExit: () => void;
}

/** watch: コマンドを n 秒ごとに再実行して全画面表示。q / Ctrl-C で終了。 */
export class WatchApp {
  private term: TerminalView;
  private line: string;
  private interval: number;
  private runLine: WatchOptions["runLine"];
  private onExit: () => void;
  private timer: number | null = null;
  private output = "";
  private done = false;

  constructor(opts: WatchOptions) {
    this.term = opts.term;
    this.line = opts.line;
    this.interval = Math.max(0.5, opts.interval);
    this.runLine = opts.runLine;
    this.onExit = opts.onExit;
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l");
    this.refresh();
    this.timer = window.setInterval(() => this.refresh(), this.interval * 1000);
  }

  dispose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.render();
  }

  onData(data: string): void {
    if (data === "q" || data === "\x03") {
      this.dispose();
      this.onExit();
    }
  }

  private refresh(): void {
    this.output = this.runLine(this.line).output;
    this.render();
  }

  private render(): void {
    const t = this.term.term;
    const cols = this.term.cols;
    const rows = this.term.rows;
    const now = new Date();
    const stamp = `${now.toDateString()} ${now.toTimeString().slice(0, 8)}`;
    const left = `Every ${this.interval.toFixed(1)}s: ${this.line}`;
    const header = padAnsi(left, Math.max(0, cols - stamp.length - 1)) + " " + stamp;
    let buf = "\x1b[H" + "\x1b[38;2;138;147;173m" + clipAnsi(header, cols) + "\x1b[0m\x1b[K\r\n\x1b[K\r\n";
    const lines = this.output.replace(/\r\n/g, "\n").split("\n");
    for (let r = 0; r < rows - 3; r++) {
      buf += clipAnsi(lines[r] ?? "", cols) + "\x1b[K" + (r < rows - 4 ? "\r\n" : "");
    }
    t.write(buf);
  }
}
