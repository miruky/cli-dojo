import { clear, el } from "../util/dom";
import { iconEl } from "./icons";
import { REFERENCE, commandCount, type RefEntry, type RefGroup } from "../lessons/reference";

export interface CheatSheetOptions {
  /** コマンドをクリックしたとき: プロンプトへ挿入。 */
  onInsert: (cmd: string) => void;
}

/**
 * 右上に常駐できるフローティング・チートシート。
 * サイト搭載の全コマンド + キーバインドを一覧。検索で絞り込み、
 * コマンドのクリックでターミナルのプロンプトへ挿入できる。✕ で閉じる。
 */
export class CheatSheet {
  private panel: HTMLElement;
  private body: HTMLElement;
  private searchInput: HTMLInputElement;
  private countEl: HTMLElement;
  private opened = false;
  private query = "";

  constructor(private opts: CheatSheetOptions) {
    this.searchInput = el("input", {
      class: "cheat-search",
      attrs: { type: "text", placeholder: "コマンド検索 (例: docker, chmod, sed)…", spellcheck: "false" },
    }) as HTMLInputElement;
    this.searchInput.addEventListener("input", () => {
      this.query = this.searchInput.value.trim().toLowerCase();
      this.renderBody();
    });

    this.countEl = el("span", { class: "cheat-count" });
    this.body = el("div", { class: "cheat-body" });

    const header = el("div", { class: "cheat-header" }, [
      el("div", { class: "cheat-title" }, [
        iconEl("list", "", 16),
        el("span", { text: "チートシート" }),
        this.countEl,
      ]),
      el("button", {
        class: "cheat-close",
        text: "✕",
        attrs: { type: "button", "aria-label": "閉じる", title: "閉じる" },
        on: { click: () => this.hide() },
      }),
    ]);

    const searchWrap = el("div", { class: "cheat-searchwrap" }, [this.searchInput]);

    this.panel = el(
      "aside",
      { class: "cheat-panel", attrs: { "aria-hidden": "true", role: "dialog", "aria-label": "チートシート" } },
      [header, searchWrap, this.body],
    );
    this.panel.hidden = true;
    document.body.append(this.panel);

    this.renderBody();
  }

  toggle(): void {
    this.opened ? this.hide() : this.show();
  }

  show(): void {
    this.opened = true;
    this.panel.hidden = false;
    this.panel.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => this.panel.classList.add("open"));
    this.searchInput.focus();
  }

  hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.panel.classList.remove("open");
    this.panel.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!this.opened) this.panel.hidden = true;
    }, 200);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  private matches(g: RefGroup): RefEntry[] {
    if (!this.query) return g.items;
    return g.items.filter(
      (it) => it.cmd.toLowerCase().includes(this.query) || it.desc.toLowerCase().includes(this.query),
    );
  }

  private renderBody(): void {
    clear(this.body);
    this.countEl.textContent = `全 ${commandCount()} コマンド`;

    let shown = 0;
    for (const g of REFERENCE) {
      const items = this.matches(g);
      if (items.length === 0) continue;
      shown += items.length;

      const sect = el("div", { class: "cheat-section", style: `--accent:${g.accent}` });
      sect.append(el("div", { class: "cheat-section-title", text: g.title }));
      const grid = el("div", { class: "cheat-rows" });
      for (const it of items) grid.append(this.row(it));
      sect.append(grid);
      this.body.append(sect);
    }

    if (shown === 0) {
      this.body.append(el("div", { class: "cheat-empty", text: "一致するコマンドがありません。" }));
    }
  }

  private row(it: RefEntry): HTMLElement {
    if (it.keys) {
      return el("div", { class: "cheat-row is-keys" }, [
        el("code", { class: "cheat-cmd", text: it.cmd }),
        el("span", { class: "cheat-desc", text: it.desc }),
      ]);
    }
    return el(
      "button",
      {
        class: "cheat-row",
        attrs: { type: "button", title: "クリックでプロンプトに挿入" },
        on: { click: () => this.opts.onInsert(it.cmd) },
      },
      [
        el("code", { class: "cheat-cmd", text: it.cmd }),
        el("span", { class: "cheat-desc", text: it.desc }),
      ],
    );
  }
}
