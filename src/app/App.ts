import { ModeManager } from "../core/modes/ModeManager";
import { Router } from "../router";
import { TerminalView } from "../core/terminal/TerminalView";
import { LineEditor } from "../core/terminal/LineEditor";
import { History } from "../core/terminal/History";
import { Shell } from "../core/shell/Shell";
import { LessonsScreen } from "../views/LessonsScreen";
import { buildChrome, type Chrome } from "../ui/chrome";
import { SideMenu } from "../ui/SideMenu";
import { MODES, type ModeId } from "../core/modes/types";

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
  private shell!: Shell;

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

    // 端末マウント後にシェルを生成 (cols / write が必要)
    this.shell = new Shell({
      write: (s) => this.terminal.term.write(s),
      cols: () => this.terminal.cols,
      history: this.history,
    });

    this.editor = new LineEditor(this.terminal.term, {
      prompt: () => this.shell.prompt(),
      history: this.history,
      completer: (line, cursor) => this.shell.complete(line, cursor),
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

    // 開発/検証用フック (E2E テストから端末/シェルへアクセス)
    (window as unknown as { __cliDojo?: unknown }).__cliDojo = {
      term: this.terminal.term,
      shell: this.shell,
      editor: this.editor,
    };
  }

  private onCommand(line: string): void {
    if (line.trim() !== "") this.shell.run(line);
    this.editor.prompt();
  }

  private selectMode(mode: ModeId): void {
    const wasSame = this.modes.id === mode;
    this.modes.set(mode);
    this.router.go("terminal");
    this.menu.hide();
    if (!wasSame && mode !== "linux") {
      const meta = MODES[mode];
      this.editor.systemNotice(
        `${meta.label} モードに切替えました (挙動は後続フェーズで有効化)。`,
      );
    }
    this.terminal.focus();
  }
}
