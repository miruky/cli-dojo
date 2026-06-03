import { ModeManager } from "../core/modes/ModeManager";
import { Router } from "../router";
import { History } from "../core/terminal/History";
import { PaneManager } from "../core/panes/PaneManager";
import { LessonsScreen } from "../views/LessonsScreen";
import { buildChrome, type Chrome } from "../ui/chrome";
import { SideMenu } from "../ui/SideMenu";
import { HelpOverlay } from "../ui/HelpOverlay";
import { type ModeId } from "../core/modes/types";

/** アプリ全体のオーケストレーション。各部品を結線する。 */
export class App {
  private modes = new ModeManager();
  private router = new Router();
  private lessons!: LessonsScreen;
  private history = new History("cli-dojo.history");
  private chrome!: Chrome;
  private menu!: SideMenu;
  private panes!: PaneManager;
  private help = new HelpOverlay();

  mount(appEl: HTMLElement): void {
    this.chrome = buildChrome(appEl, {
      onHamburger: () => this.menu.toggle(),
      onHelp: () => this.help.toggle(),
    });
    this.menu = new SideMenu(this.chrome.hamburgerBtn, {
      onSelectView: (view) => {
        this.router.go(view);
        this.menu.hide();
      },
      onSelectMode: (mode) => this.selectMode(mode),
    });

    this.panes = new PaneManager(this.chrome.terminalHost, this.history, {
      onActiveChange: () => this.exposeHook(),
    });
    this.lessons = new LessonsScreen({ onTry: (cmd) => this.tryCommand(cmd) });
    this.lessons.mount(this.chrome.lessonsHost);

    this.router.changed.on((view) => {
      this.chrome.setActiveView(view);
      this.menu.setActiveView(view);
      if (view === "terminal") {
        this.panes.activePane.fit();
        this.panes.activePane.focus();
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

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.menu.hide();
        this.help.hide();
      }
    });

    this.exposeHook();
  }

  private tryCommand(cmd: string): void {
    this.router.go("terminal");
    const pane = this.panes.activePane;
    pane.runCommand(cmd);
    pane.focus();
  }

  private exposeHook(): void {
    if (!this.panes) return;
    const pane = this.panes.activePane;
    (window as unknown as { __cliDojo?: unknown }).__cliDojo = {
      panes: this.panes,
      pane,
      term: pane.terminal.term,
      shell: pane.shell,
      editor: pane.editor,
    };
  }

  private selectMode(mode: ModeId): void {
    const wasSame = this.modes.id === mode;
    this.modes.set(mode);
    this.router.go("terminal");
    this.menu.hide();
    const pane = this.panes.activePane;
    if (mode === "linux") {
      pane.exitMode();
    } else if (mode === "tmux" || mode === "nvim" || mode === "emacs") {
      pane.launchMode(mode);
    } else if (mode === "ghostty" && !wasSame && !pane.isInApp()) {
      pane.notice(
        "Ghostty: ペイン分割 ctrl+shift+v(右)/ctrl+shift+h(下), 移動 ctrl+h/j/k/l, 閉じる ctrl+x, リサイズ ctrl+,/./;/'",
      );
    }
    pane.focus();
  }
}
