import { el } from "../util/dom";
import { iconEl } from "./icons";
import type { ViewId } from "../router";
import { MODE_ORDER, MODES, type ModeId } from "../core/modes/types";

export interface SideMenuCallbacks {
  onSelectView: (view: ViewId) => void;
  onSelectMode: (mode: ModeId) => void;
}

/**
 * 左からスライドインするメニュー。通常は隠れていて、☰ で開く。
 * 「ボタンは通常邪魔」という要望に合わせ、モード/表示切替をここに集約。
 */
export class SideMenu {
  private aside: HTMLElement;
  private scrim: HTMLElement;
  private hamburger: HTMLButtonElement;
  private opened = false;
  private viewButtons = new Map<ViewId, HTMLButtonElement>();
  private modeButtons = new Map<ModeId, HTMLButtonElement>();

  constructor(hamburger: HTMLButtonElement, cb: SideMenuCallbacks) {
    this.hamburger = hamburger;

    this.scrim = el("div", {
      class: "scrim",
      on: { click: () => this.hide() },
    });
    this.scrim.hidden = true;

    const header = el("div", { class: "menu-header" }, [
      el("span", { class: "menu-title", text: "メニュー" }),
      el("button", {
        class: "menu-close",
        text: "✕",
        attrs: { type: "button", "aria-label": "閉じる" },
        on: { click: () => this.hide() },
      }),
    ]);

    const viewSection = el("div", { class: "menu-section" }, [
      el("div", { class: "menu-label", text: "表示" }),
      this.viewButton("terminal", "monitor", "ターミナル", cb),
      this.viewButton("lessons", "book", "レッスン", cb),
    ]);

    const modeSection = el("div", { class: "menu-section" }, [
      el("div", { class: "menu-label", text: "モード" }),
      ...MODE_ORDER.map((id) => this.modeButton(id, cb)),
    ]);

    const footer = el("div", { class: "menu-footer" }, [
      el("a", {
        class: "menu-link",
        text: "GitHub リポジトリ →",
        attrs: {
          href: "https://github.com/miruky/cli-dojo",
          target: "_blank",
          rel: "noopener",
        },
      }),
      el("div", { class: "menu-version", text: "cli-dojo · 開発中" }),
    ]);

    this.aside = el(
      "aside",
      { class: "sidemenu", attrs: { "aria-hidden": "true" } },
      [header, viewSection, modeSection, footer],
    );

    document.body.append(this.scrim, this.aside);
  }

  private viewButton(
    id: ViewId,
    icon: string,
    label: string,
    cb: SideMenuCallbacks,
  ): HTMLButtonElement {
    const btn = el(
      "button",
      {
        class: "menu-item",
        attrs: { type: "button" },
        on: { click: () => cb.onSelectView(id) },
      },
      [
        iconEl(icon, "menu-item-glyph"),
        el("span", { class: "menu-item-label", text: label }),
      ],
    );
    this.viewButtons.set(id, btn);
    return btn;
  }

  private modeButton(id: ModeId, cb: SideMenuCallbacks): HTMLButtonElement {
    const m = MODES[id];
    const btn = el(
      "button",
      {
        class: "menu-item menu-mode",
        style: `--item-accent:${m.color}`,
        attrs: { type: "button" },
        on: { click: () => cb.onSelectMode(id) },
      },
      [
        iconEl(m.icon, "menu-item-glyph"),
        el("span", { class: "menu-item-label", text: m.label }),
        el("span", { class: "menu-item-hint", text: m.hint }),
      ],
    );
    this.modeButtons.set(id, btn);
    return btn;
  }

  toggle(): void {
    if (this.opened) this.hide();
    else this.show();
  }

  show(): void {
    this.opened = true;
    this.scrim.hidden = false;
    requestAnimationFrame(() => this.scrim.classList.add("show"));
    this.aside.classList.add("open");
    this.aside.setAttribute("aria-hidden", "false");
    this.hamburger.setAttribute("aria-expanded", "true");
    this.hamburger.classList.add("open");
  }

  hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.aside.classList.remove("open");
    this.scrim.classList.remove("show");
    this.aside.setAttribute("aria-hidden", "true");
    this.hamburger.setAttribute("aria-expanded", "false");
    this.hamburger.classList.remove("open");
    window.setTimeout(() => {
      if (!this.opened) this.scrim.hidden = true;
    }, 220);
  }

  setActiveView(view: ViewId): void {
    for (const [id, btn] of this.viewButtons) {
      btn.classList.toggle("active", id === view);
    }
  }

  setActiveMode(mode: ModeId): void {
    for (const [id, btn] of this.modeButtons) {
      btn.classList.toggle("active", id === mode);
    }
  }
}
