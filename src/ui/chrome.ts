import { el } from "../util/dom";
import type { ViewId } from "../router";
import type { ModeMeta } from "../core/modes/types";

/** トップバー + コンテンツ領域 (端末/レッスンの2画面) を #app 内に構築する。 */
export interface Chrome {
  terminalHost: HTMLElement;
  lessonsHost: HTMLElement;
  hamburgerBtn: HTMLButtonElement;
  setActiveView(view: ViewId): void;
  setMode(meta: ModeMeta): void;
}

export function buildChrome(
  app: HTMLElement,
  opts: { onHamburger: () => void; onHelp: () => void },
): Chrome {
  const hamburgerBtn = el(
    "button",
    {
      class: "hamburger",
      attrs: { type: "button", "aria-label": "メニュー", "aria-expanded": "false" },
      on: { click: () => opts.onHamburger() },
    },
    [
      el("span", { class: "hb-line" }),
      el("span", { class: "hb-line" }),
      el("span", { class: "hb-line" }),
    ],
  );

  const dot = el("span", { class: "mode-dot" });
  const modeName = el("span", { class: "mode-name", text: "LINUX" });
  const modeIndicator = el(
    "div",
    { class: "mode-indicator", title: "現在のモード" },
    [dot, modeName],
  );

  const brand = el("div", { class: "brand" }, [
    el("span", { class: "brand-glyph", text: "🥋" }),
    el("span", { class: "brand-name", text: "cli-dojo" }),
  ]);

  const helpBtn = el("button", {
    class: "help-btn",
    text: "?",
    attrs: { type: "button", "aria-label": "キーバインドヘルプ", title: "キーバインド早見表" },
    on: { click: () => opts.onHelp() },
  });

  const topbar = el("header", { class: "topbar" }, [
    hamburgerBtn,
    brand,
    el("div", { class: "spacer" }),
    helpBtn,
    modeIndicator,
  ]);

  const terminalHost = el("div", { class: "terminal-host" });
  const screenTerminal = el("section", { class: "screen screen-terminal" }, [
    terminalHost,
  ]);

  const lessonsHost = el("div", { class: "lessons-host" });
  const screenLessons = el("section", { class: "screen screen-lessons" }, [
    lessonsHost,
  ]);
  screenLessons.hidden = true;

  const content = el("main", { class: "content" }, [
    screenTerminal,
    screenLessons,
  ]);

  app.append(topbar, content);

  return {
    terminalHost,
    lessonsHost,
    hamburgerBtn,
    setActiveView(view) {
      screenTerminal.hidden = view !== "terminal";
      screenLessons.hidden = view !== "lessons";
    },
    setMode(meta) {
      modeName.textContent = meta.badge;
      dot.style.background = meta.color;
      dot.style.boxShadow = `0 0 10px ${meta.color}`;
    },
  };
}
