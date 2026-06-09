import { el } from "../../util/dom";
import { TerminalView } from "../terminal/TerminalView";
import { LineEditor } from "../terminal/LineEditor";
import type { History } from "../terminal/History";
import { Shell } from "../shell/Shell";
import type { VFS } from "../vfs/VFS";
import { TmuxSession } from "../modes/tmux/TmuxSession";
import { VimEditor } from "../modes/vim/VimEditor";
import { EmacsEditor } from "../modes/emacs/EmacsEditor";
import type { ModeId } from "../modes/types";

let nextId = 1;

/** 起動コマンド名 → 表示モードID。vim/vi/view/nvim はすべて nvim バッジ。 */
function modeOf(name: string): ModeId | null {
  if (name === "tmux") return "tmux";
  if (name === "vim" || name === "vi" || name === "nvim" || name === "view") return "nvim";
  if (name === "emacs") return "emacs";
  return null;
}

export interface AppInstance {
  el: HTMLElement;
  fit(): void;
  focus(): void;
  dispose(): void;
}

/** 端末を占有するエディタ系モード (vim/emacs)。 */
export interface EditorApp {
  onData(data: string): void;
  fit(): void;
  dispose(): void;
}

export interface PaneOptions {
  history: History;
  vfs: VFS;
  onFocusRequest: (pane: Pane) => void;
  /** ホストするモードが変化したとき (起動/終了) に呼ばれる。null = 素のシェル。 */
  onModeChange?: (pane: Pane, mode: ModeId | null) => void;
}

/** 1つのペイン = 独立したシェルセッション。モード(tmux等)をホストできる。VFS は共有。 */
export class Pane {
  readonly id = nextId++;
  readonly el: HTMLElement;
  readonly terminal = new TerminalView();
  shell!: Shell;
  editor!: LineEditor;
  private host: HTMLElement;
  private opts: PaneOptions;
  private mounted = false;
  private pendingApp: { name: string; args: string[] } | null = null;
  private currentApp: AppInstance | null = null;
  private currentEditor: EditorApp | null = null;
  private mode: ModeId | null = null;

  constructor(opts: PaneOptions) {
    this.opts = opts;
    this.host = el("div", { class: "pane-terminal" });
    this.el = el("div", { class: "pane", attrs: { "data-pane": String(this.id) } }, [this.host]);
    this.el.addEventListener("mousedown", () => this.opts.onFocusRequest(this));
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.terminal.mount(this.host);
    this.terminal.fit();
    this.shell = new Shell({
      write: (s) => this.terminal.term.write(s),
      cols: () => this.terminal.cols,
      history: this.opts.history,
      vfs: this.opts.vfs,
      onLaunch: (name, args) => {
        this.pendingApp = { name, args };
      },
    });
    this.editor = new LineEditor(this.terminal.term, {
      prompt: () => this.shell.prompt(),
      header: () => this.shell.promptHeader(),
      highlight: (line) => this.shell.highlight(line),
      history: this.opts.history,
      completer: (line, cursor) => this.shell.complete(line, cursor),
      onSubmit: (line) => this.onCommand(line),
    });
    this.terminal.setDataHandler((d) => this.editor.onData(d));
    this.terminal.banner();
    this.editor.prompt();
  }

  private onCommand(line: string): void {
    if (line.trim() !== "") this.shell.run(line);
    const a = this.pendingApp;
    this.pendingApp = null;
    if (a) {
      if (this.launch(a.name, a.args)) return;
      this.editor.systemNotice(`${a.name}: このモードは順次実装します (現状: tmux が利用可能)。`);
      return;
    }
    this.editor.prompt();
  }

  /** モードボタン等から起動 (シェルコマンドを介さず)。既に別モード中なら一旦抜けてから切替。 */
  launchMode(name: string): void {
    if (this.currentApp || this.currentEditor) this.exitMode();
    if (this.launch(name, [])) return;
    this.editor.systemNotice(`${name}: このモードは順次実装します (現状: tmux が利用可能)。`);
  }

  /** モードを抜けてシェルへ戻る。 */
  exitMode(): void {
    if (this.currentApp) this.exitApp();
    else if (this.currentEditor) this.exitEditor();
  }

  isInApp(): boolean {
    return this.currentApp != null || this.currentEditor != null;
  }

  /** 現在ホストしているモード (null = 素のシェル)。 */
  currentMode(): ModeId | null {
    return this.mode;
  }

  private setMode(mode: ModeId | null): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.opts.onModeChange?.(this, mode);
  }

  /** 外部 (チートシート等) からプロンプト行へコマンドを挿入する。アプリ中は無視。 */
  fillPrompt(text: string): void {
    if (this.currentApp || this.currentEditor) return;
    this.editor.fill(text);
    this.terminal.focus();
  }

  private launch(name: string, args: string[]): boolean {
    const ok = this.launchInner(name, args);
    if (ok) this.setMode(modeOf(name));
    return ok;
  }

  private launchInner(name: string, args: string[]): boolean {
    if (name === "tmux") {
      const session = new TmuxSession({
        history: this.opts.history,
        vfs: this.opts.vfs,
        onExit: () => this.exitApp(),
      });
      this.currentApp = session;
      this.host.style.display = "none";
      this.el.appendChild(session.el);
      session.start();
      session.fit();
      session.focus();
      return true;
    }
    if (name === "vim" || name === "nvim" || name === "vi") {
      const editor = new VimEditor({
        term: this.terminal,
        vfs: this.opts.vfs,
        cwd: this.shell.env.cwd,
        args,
        flavor: name === "nvim" ? "nvim" : "vim",
        onExit: () => this.exitEditor(),
      });
      this.currentEditor = editor;
      this.terminal.setDataHandler((d) => editor.onData(d));
      editor.start();
      this.terminal.focus();
      return true;
    }
    if (name === "emacs") {
      const editor = new EmacsEditor({
        term: this.terminal,
        vfs: this.opts.vfs,
        cwd: this.shell.env.cwd,
        args,
        onExit: () => this.exitEditor(),
      });
      this.currentEditor = editor;
      this.terminal.setDataHandler((d) => editor.onData(d));
      editor.start();
      this.terminal.focus();
      return true;
    }
    return false;
  }

  private exitApp(): void {
    if (this.currentApp) {
      this.currentApp.dispose();
      this.currentApp.el.remove();
      this.currentApp = null;
    }
    this.setMode(null);
    this.host.style.display = "";
    this.terminal.fit();
    this.editor.prompt();
    this.terminal.focus();
  }

  private exitEditor(): void {
    if (this.currentEditor) {
      this.currentEditor.dispose();
      this.currentEditor = null;
    }
    this.setMode(null);
    this.terminal.setDataHandler((d) => this.editor.onData(d));
    this.terminal.fit();
    this.editor.prompt();
    this.terminal.focus();
  }

  /** レッスンの「Try」などから外部入力を流し込む。モード起動コマンドにも対応。 */
  runCommand(line: string): void {
    if (this.currentApp || this.currentEditor) return;
    this.terminal.term.write(line + "\r\n");
    if (line.trim() !== "") this.shell.run(line);
    const a = this.pendingApp;
    this.pendingApp = null;
    if (a) {
      if (this.launch(a.name, a.args)) return;
      this.editor.systemNotice(`${a.name}: このモードは順次実装します (現状: tmux が利用可能)。`);
      return;
    }
    this.editor.prompt();
  }

  setActive(active: boolean): void {
    this.el.classList.toggle("pane-active", active);
  }

  fit(): void {
    if (this.currentApp) this.currentApp.fit();
    else if (this.currentEditor) {
      this.terminal.fit();
      this.currentEditor.fit();
    } else this.terminal.fit();
  }
  focus(): void {
    if (this.currentApp) this.currentApp.focus();
    else this.terminal.focus();
  }
  notice(text: string): void {
    this.editor.systemNotice(text);
  }
  rect(): DOMRect {
    return this.el.getBoundingClientRect();
  }
}
