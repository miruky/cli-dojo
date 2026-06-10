import { el } from "../util/dom";
import { iconEl } from "./icons";
import type { ViewId } from "../router";
import type { ModeMeta } from "../core/modes/types";
import { CHALLENGES, beltCssFor } from "../lessons/challenges";

/** トップバー + コンテンツ領域 (端末/レッスンの2画面) を #app 内に構築する。 */
export interface Chrome {
  terminalHost: HTMLElement;
  lessonsHost: HTMLElement;
  cardsHost: HTMLElement;
  hamburgerBtn: HTMLButtonElement;
  setActiveView(view: ViewId): void;
  setMode(meta: ModeMeta): void;
}

function clearedCount(): number {
  try {
    return (JSON.parse(localStorage.getItem("cli-dojo.challenges.cleared") ?? "[]") as number[]).length;
  } catch {
    return 0;
  }
}

export function buildChrome(
  app: HTMLElement,
  opts: { onHamburger: () => void; onHelp: () => void; onCheat: () => void; onBelt: () => void },
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
    iconEl("terminal-square", "brand-glyph"),
    el("span", { class: "brand-name", text: "cli-dojo" }),
  ]);

  const cheatBtn = el(
    "button",
    {
      class: "cheat-btn",
      attrs: { type: "button", "aria-label": "チートシート", title: "チートシート (全コマンド) を常駐表示" },
      on: { click: () => opts.onCheat() },
    },
    [iconEl("list", "", 15), el("span", { class: "cheat-btn-label", text: "チートシート" })],
  );

  const helpBtn = el("button", {
    class: "help-btn",
    text: "?",
    attrs: { type: "button", "aria-label": "キーバインドヘルプ", title: "キーバインド早見表" },
    on: { click: () => opts.onHelp() },
  });

  // 道場の帯バッジ (チャレンジクリアで即時更新)
  const beltName = el("span", { class: "belt-name" });
  const beltCount = el("span", { class: "belt-count" });
  const beltChip = el(
    "button",
    {
      class: "belt-chip",
      attrs: { type: "button", title: "チャレンジ道場の進捗 (クリックで challenge を実行)" },
      on: { click: () => opts.onBelt() },
    },
    [iconEl("award", "", 13), beltName, beltCount],
  );
  const refreshBelt = (): void => {
    const n = clearedCount();
    const [name, css] = beltCssFor(n);
    beltName.textContent = name;
    beltCount.textContent = `${n}/${CHALLENGES.length}`;
    beltChip.style.setProperty("--belt-color", css);
  };
  refreshBelt();
  window.addEventListener("cli-dojo:progress" as keyof WindowEventMap, refreshBelt);

  const topbar = el("header", { class: "topbar" }, [
    hamburgerBtn,
    brand,
    el("div", { class: "spacer" }),
    beltChip,
    cheatBtn,
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

  const cardsHost = el("div", { class: "cards-host" });
  const screenCards = el("section", { class: "screen screen-cards" }, [cardsHost]);
  screenCards.hidden = true;

  const content = el("main", { class: "content" }, [
    screenTerminal,
    screenLessons,
    screenCards,
  ]);

  app.append(topbar, content);

  return {
    terminalHost,
    lessonsHost,
    cardsHost,
    hamburgerBtn,
    setActiveView(view) {
      screenTerminal.hidden = view !== "terminal";
      screenLessons.hidden = view !== "lessons";
      screenCards.hidden = view !== "cards";
    },
    setMode(meta) {
      modeName.textContent = meta.badge;
      dot.style.background = meta.color;
      dot.style.boxShadow = `0 0 10px ${meta.color}`;
    },
  };
}
