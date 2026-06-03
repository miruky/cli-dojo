import { ModeManager } from "../core/modes/ModeManager";
import { Router } from "../router";
import { TerminalView } from "../core/terminal/TerminalView";
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
  private chrome!: Chrome;
  private menu!: SideMenu;

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

    this.terminal.focus();
  }

  private selectMode(mode: ModeId): void {
    const wasSame = this.modes.id === mode;
    this.modes.set(mode);
    this.router.go("terminal");
    this.menu.hide();
    if (!wasSame) {
      const meta = MODES[mode];
      if (mode === "linux") {
        this.terminal.notice("Linux シェルモードです。");
      } else {
        this.terminal.notice(
          `${meta.label} モードに切替えました (挙動は後続フェーズで有効化)。`,
        );
      }
    } else {
      this.terminal.focus();
    }
  }
}
