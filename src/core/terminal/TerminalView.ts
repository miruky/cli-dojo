import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { COBALT_THEME, TERMINAL_FONT } from "./theme";
import { dim, yellow } from "./ansi";

/**
 * xterm.js のラッパ。入力は setDataHandler で差し替え可能にし、
 * Linux シェル(LineEditor) / 各エディタモードがハンドラを取り合う。
 */
export class TerminalView {
  readonly term: Terminal;
  private fitAddon = new FitAddon();
  private host: HTMLElement | null = null;
  private dataHandler: ((data: string) => void) | null = null;

  constructor() {
    this.term = new Terminal({
      allowTransparency: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: TERMINAL_FONT,
      fontSize: 16,
      lineHeight: 1.2,
      theme: COBALT_THEME,
      scrollback: 5000,
    });
    this.term.loadAddon(this.fitAddon);
    this.term.onData((data) => this.dataHandler?.(data));
  }

  mount(host: HTMLElement): void {
    if (this.host) return;
    this.host = host;
    this.term.open(host);
    this.fit();
  }

  setDataHandler(fn: ((data: string) => void) | null): void {
    this.dataHandler = fn;
  }

  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      /* サイズ未確定のときは無視 */
    }
  }

  focus(): void {
    this.term.focus();
  }

  write(text: string): void {
    this.term.write(text);
  }

  writeln(text: string): void {
    this.term.writeln(text);
  }

  get cols(): number {
    return this.term.cols;
  }

  banner(): void {
    const t = this.term;
    t.writeln("");
    t.writeln("  " + yellow("cli-dojo") + "  " + dim("— ターミナル練習道場"));
    t.writeln("  " + dim("Linux · Ghostty · tmux · Neovim · Emacs を一つの画面で"));
    t.writeln("");
    t.writeln("  " + dim("左上の ☰ メニューからモード切替 / レッスンへ移動できます。"));
    t.writeln("  " + dim("矢印・Ctrl-A/E/K/U/W・↑↓履歴・Ctrl-R 検索・Tab 補完が使えます。"));
    t.writeln("  " + dim("実シェルは Phase 3 以降で順次有効化されます。"));
    t.writeln("");
  }
}
