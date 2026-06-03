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
    t.writeln("  " + dim("本物のシェルが動きます。まずは試してみましょう:"));
    t.writeln(
      "    " + yellow("ls -la") + dim("   ") + yellow("cat README.txt") + dim("   ") +
        yellow("cd projects") + dim("   ") + yellow("help"),
    );
    t.writeln("  " + dim("左上の ☰ からモード切替 / レッスンへ。Tab 補完・↑↓履歴・Ctrl-R 検索対応。"));
    t.writeln("");
  }
}
