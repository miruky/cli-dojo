import { ModeManager } from "../core/modes/ModeManager";
import { Router } from "../router";
import { TerminalView } from "../core/terminal/TerminalView";
import { LineEditor, type CompletionResult } from "../core/terminal/LineEditor";
import { History } from "../core/terminal/History";
import { LessonsScreen } from "../views/LessonsScreen";
import { buildChrome, type Chrome } from "../ui/chrome";
import { SideMenu } from "../ui/SideMenu";
import { MODES, type ModeId } from "../core/modes/types";
import { blue, dim, green } from "../core/terminal/ansi";

// Phase 2 のデモ補完 (Phase 3 で実シェルの補完に差し替え)
const DEMO_WORDS = [
  "help",
  "clear",
  "echo",
  "linux",
  "tmux",
  "nvim",
  "emacs",
  "ghostty",
  "lessons",
];

function demoCompleter(line: string, cursor: number): CompletionResult | null {
  const chars = [...line];
  let start = cursor;
  while (start > 0 && chars[start - 1] !== " ") start--;
  const token = chars.slice(start, cursor).join("");
  if (!token) return null;
  const matches = DEMO_WORDS.filter((w) => w.startsWith(token));
  if (matches.length === 0) return null;
  return { items: matches, replaceFrom: start };
}

/** アプリ全体のオーケストレーション。各部品を結線する。 */
export class App {
  private modes = new ModeManager();
  private router = new Router();
  private terminal = new TerminalView();
  private lessons = new LessonsScreen();
  private history = new History("cli-dojo.history");
  private chrome!: Chrome;
  private menu!: SideMenu;
  private editor!: LineEditor;

  mount(appEl: HTMLElement): void {
    this.chrome = buildChrome(appEl, { onHamburger: () => this.menu.toggle() });
    this.menu = new SideMenu(this.chrome.hamburgerBtn, {
      onSelectView: (view) => {
        this.router.go(view);
        this.menu.hide();
      },
      onSelectMode: (mode) => this.selectMode(mode),
    });

    this.terminal.mount(this.chrome.terminalHost);
    this.lessons.mount(this.chrome.lessonsHost);

    this.editor = new LineEditor(this.terminal.term, {
      prompt: () => this.promptString(),
      history: this.history,
      completer: demoCompleter,
      onSubmit: (line) => this.onCommand(line),
    });
    this.terminal.setDataHandler((d) => this.editor.onData(d));

    this.router.changed.on((view) => {
      this.chrome.setActiveView(view);
      this.menu.setActiveView(view);
      if (view === "terminal") {
        this.terminal.fit();
        this.terminal.focus();
      }
    });

    this.modes.changed.on((meta) => {
      this.chrome.setMode(meta);
      this.menu.setActiveMode(meta.id);
    });

    // 初期状態
    this.chrome.setActiveView("terminal");
    this.chrome.setMode(this.modes.meta);
    this.menu.setActiveView("terminal");
    this.menu.setActiveMode(this.modes.id);

    window.addEventListener("resize", () => this.terminal.fit());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.menu.hide();
    });

    // 起動
    this.terminal.banner();
    this.editor.prompt();
    this.terminal.focus();
  }

  private promptString(): string {
    return `${green("guest@cli-dojo")}:${blue("~")}$ `;
  }

  private onCommand(line: string): void {
    const t = line.trim();
    if (t === "clear") {
      this.terminal.write("\x1b[2J\x1b[3J\x1b[H");
      this.editor.prompt();
      return;
    }
    if (t === "help") {
      this.editor.println(
        dim("実シェルは Phase 3 以降で有効化されます。現在は行編集/履歴/補完のデモです。"),
      );
      this.editor.prompt();
      return;
    }
    if (t.length > 0) {
      this.editor.println(dim("未実装のコマンドです: ") + t);
    }
    this.editor.prompt();
  }

  private selectMode(mode: ModeId): void {
    const wasSame = this.modes.id === mode;
    this.modes.set(mode);
    this.router.go("terminal");
    this.menu.hide();
    if (!wasSame) {
      const meta = MODES[mode];
      this.editor.systemNotice(
        mode === "linux"
          ? "Linux シェルモードです。"
          : `${meta.label} モードに切替えました (挙動は後続フェーズで有効化)。`,
      );
    }
    this.terminal.focus();
  }
}
