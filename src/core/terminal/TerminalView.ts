import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { COBALT_THEME, TERMINAL_FONT } from "./theme";
import { blue, dim, green, yellow } from "./ansi";

/**
 * xterm.js のラッパ。
 * Phase 1 時点では簡易エコー入力のみ。Phase 2 で本物の Readline、
 * Phase 3+ でシェル/モードを接続する。
 */
export class TerminalView {
  readonly term: Terminal;
  private fitAddon = new FitAddon();
  private host: HTMLElement | null = null;
  private line = "";

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
  }

  mount(host: HTMLElement): void {
    if (this.host) return;
    this.host = host;
    this.term.open(host);
    this.fit();
    this.banner();
    this.prompt();
    this.term.onData((data) => this.onData(data));
  }

  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      /* 表示前など、サイズ未確定のときは無視 */
    }
  }

  focus(): void {
    this.term.focus();
  }

  /** システムからの通知行 (モード切替の案内など) を表示して再プロンプト。 */
  notice(text: string): void {
    this.term.write("\r\n" + dim(text) + "\r\n");
    this.line = "";
    this.prompt();
    this.focus();
  }

  private get promptStr(): string {
    return `${green("guest@cli-dojo")}:${blue("~")}$ `;
  }

  private prompt(): void {
    this.term.write(this.promptStr);
  }

  private banner(): void {
    const t = this.term;
    t.writeln("");
    t.writeln("  " + yellow("cli-dojo") + "  " + dim("— ターミナル練習道場"));
    t.writeln(
      "  " + dim("Linux · Ghostty · tmux · Neovim · Emacs を一つの画面で"),
    );
    t.writeln("");
    t.writeln(
      "  " + dim("左上の ☰ メニューからモード切替 / レッスンへ移動できます。"),
    );
    t.writeln(
      "  " + dim("実シェルは Phase 3 以降で順次有効化されます (現在: 簡易入力)。"),
    );
    t.writeln("");
  }

  private onData(data: string): void {
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === "\r") {
        this.term.write("\r\n");
        const cmd = this.line.trim();
        if (cmd.length > 0) {
          this.term.writeln(dim("未実装のコマンドです: ") + cmd);
        }
        this.line = "";
        this.prompt();
      } else if (code === 127) {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1);
          this.term.write("\b \b");
        }
      } else if (code === 3) {
        this.term.write("^C\r\n");
        this.line = "";
        this.prompt();
      } else if (code >= 32) {
        this.line += ch;
        this.term.write(ch);
      }
    }
  }
}
