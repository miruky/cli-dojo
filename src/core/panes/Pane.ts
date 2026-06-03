import { el } from "../../util/dom";
import { TerminalView } from "../terminal/TerminalView";
import { LineEditor } from "../terminal/LineEditor";
import type { History } from "../terminal/History";
import { Shell } from "../shell/Shell";
import type { VFS } from "../vfs/VFS";

let nextId = 1;

export interface PaneOptions {
  history: History;
  vfs: VFS;
  onFocusRequest: (pane: Pane) => void;
}

/** 1つのペイン = 独立したシェルセッション (端末 + シェル + 行編集)。VFS は共有。 */
export class Pane {
  readonly id = nextId++;
  readonly el: HTMLElement;
  readonly terminal = new TerminalView();
  shell!: Shell;
  editor!: LineEditor;
  private host: HTMLElement;
  private opts: PaneOptions;
  private mounted = false;

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
    });
    this.editor = new LineEditor(this.terminal.term, {
      prompt: () => this.shell.prompt(),
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
    this.editor.prompt();
  }

  /** レッスンの「Try」などから外部入力を流し込む。 */
  runCommand(line: string): void {
    this.terminal.term.write(line + "\r\n");
    if (line.trim() !== "") this.shell.run(line);
    this.editor.prompt();
  }

  setActive(active: boolean): void {
    this.el.classList.toggle("pane-active", active);
  }

  fit(): void {
    this.terminal.fit();
  }
  focus(): void {
    this.terminal.focus();
  }
  notice(text: string): void {
    this.editor.systemNotice(text);
  }
  rect(): DOMRect {
    return this.el.getBoundingClientRect();
  }
}
