import { el } from "../util/dom";

interface Category {
  key: string;
  title: string;
  desc: string;
  glyph: string;
  accent: string;
}

const CATEGORIES: Category[] = [
  {
    key: "linux",
    title: "Linux コマンド",
    desc: "基礎 → LPIC レベル3 まで幅広く",
    glyph: "🐧",
    accent: "var(--accent-green)",
  },
  {
    key: "regex",
    title: "正規表現",
    desc: "grep / sed / awk で複雑なパターンを実践",
    glyph: ".*",
    accent: "var(--accent-cyan)",
  },
  {
    key: "vim",
    title: "Vim / Neovim",
    desc: "モーダル編集 (LazyVim 風)",
    glyph: "",
    accent: "var(--accent-green)",
  },
  {
    key: "emacs",
    title: "Emacs",
    desc: "C-x C-c など標準キーバインド",
    glyph: "Ψ",
    accent: "var(--accent-magenta)",
  },
  {
    key: "tmux",
    title: "tmux",
    desc: "prefix Ctrl-b による端末多重化",
    glyph: "▦",
    accent: "#67ec5a",
  },
  {
    key: "ghostty",
    title: "Ghostty",
    desc: "あなたのペイン分割・移動設定",
    glyph: "👻",
    accent: "var(--accent)",
  },
];

/** Phase 1: レッスン画面の枠とデザイン。内容は Phase 10 で充実させる。 */
export class LessonsScreen {
  private root = el("div", { class: "lessons" });

  mount(host: HTMLElement): void {
    host.append(this.root);
    this.render();
  }

  private render(): void {
    this.root.append(
      el("div", { class: "lessons-head" }, [
        el("div", { class: "lessons-kicker", text: "LESSONS & CHEAT SHEET" }),
        el("h1", { class: "lessons-title", text: "レッスン & チートシート" }),
        el("p", {
          class: "lessons-sub",
          text: "見やすいリファレンスと、端末に直接流し込める「Try」。各カテゴリは順次充実させます。",
        }),
      ]),
      el(
        "div",
        { class: "lesson-grid" },
        CATEGORIES.map((c) => this.card(c)),
      ),
    );
  }

  private card(c: Category): HTMLElement {
    return el(
      "button",
      {
        class: "lesson-card",
        style: `--card-accent:${c.accent}`,
        attrs: { type: "button" },
      },
      [
        el("div", { class: "lesson-card-glyph", text: c.glyph }),
        el("div", { class: "lesson-card-body" }, [
          el("div", { class: "lesson-card-title", text: c.title }),
          el("div", { class: "lesson-card-desc", text: c.desc }),
        ]),
        el("div", { class: "lesson-card-badge", text: "準備中" }),
      ],
    );
  }
}
