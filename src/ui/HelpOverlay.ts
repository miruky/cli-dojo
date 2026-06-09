import { el } from "../util/dom";
import { iconEl } from "./icons";

interface KeySection {
  title: string;
  accent: string;
  rows: Array<[string, string]>;
}

const SECTIONS: KeySection[] = [
  {
    title: "Ghostty ペイン",
    accent: "var(--accent)",
    rows: [
      ["ctrl+h / j / k / l", "ペイン移動 (左/下/上/右)"],
      ["ctrl+shift+v / ctrl+shift+h", "右に分割 / 下に分割"],
      ["ctrl+x", "ペインを閉じる"],
      ["ctrl+, . ; '", "リサイズ (左/右/下/上)"],
      ["ctrl+shift+k / ctrl+shift+j", "上 / 下にスクロール"],
    ],
  },
  {
    title: "シェル (readline)",
    accent: "var(--accent-green)",
    rows: [
      ["Ctrl-A / Ctrl-E", "行頭 / 行末"],
      ["Ctrl-K / Ctrl-U / Ctrl-W", "後/前/単語を削除"],
      ["↑ ↓ / Ctrl-R", "履歴 / 逆検索"],
      ["Tab / Ctrl-L / Ctrl-C", "補完 / クリア / 中断"],
    ],
  },
  {
    title: "tmux (prefix Ctrl-b)",
    accent: "#67ec5a",
    rows: [
      ["Ctrl-b c / n / p", "新window / 次 / 前"],
      ['Ctrl-b % / "', "縦分割 / 横分割"],
      ["Ctrl-b 矢印 / o", "ペイン移動 / 巡回"],
      ["Ctrl-b x / d", "ペイン閉じる / デタッチ"],
    ],
  },
  {
    title: "Vim / Neovim",
    accent: "var(--accent-green)",
    rows: [
      ["i a o / Esc", "挿入開始 / normal へ"],
      ["h j k l w b / gg G", "カーソル移動"],
      ["dd yy p / dw ciw", "行削除·ヤンク·貼付 / 単語"],
      [":w :q :wq / :%s/a/b/g", "保存·終了 / 置換"],
      ["/word n N / u Ctrl-r", "検索 / undo·redo"],
    ],
  },
  {
    title: "Emacs",
    accent: "var(--accent-magenta)",
    rows: [
      ["C-f C-b C-n C-p / C-a C-e", "移動"],
      ["C-k C-y / C-w M-w", "切取·貼付 / リージョン"],
      ["C-x C-f / C-x C-s / C-x C-c", "開く / 保存 / 終了"],
      ["C-s C-r / C-g", "検索 / 中断"],
    ],
  },
  {
    title: "Emacs dired / tab-line",
    accent: "var(--accent-magenta)",
    rows: [
      ["emacs . / C-x d", "ディレクトリを dired で開く"],
      ["n p RET ^ q", "上下移動 / 開く / 親へ / 閉じる"],
      ["M-x tab-line-mode", "ファイルをタブ表示 ON/OFF"],
      ["C-x ← / C-x →", "前 / 次のファイルのタブへ"],
    ],
  },
];

export class HelpOverlay {
  private scrim: HTMLElement;
  private panel: HTMLElement;
  private opened = false;

  constructor() {
    this.scrim = el("div", { class: "help-scrim", on: { click: () => this.hide() } });
    this.scrim.hidden = true;

    const grid = el("div", { class: "help-grid" });
    for (const s of SECTIONS) {
      const rows = s.rows.map(([k, d]) =>
        el("div", { class: "help-row" }, [
          el("kbd", { class: "help-key", text: k }),
          el("span", { class: "help-desc", text: d }),
        ]),
      );
      grid.append(
        el("div", { class: "help-section", style: `--accent:${s.accent}` }, [
          el("div", { class: "help-section-title", text: s.title }),
          ...rows,
        ]),
      );
    }

    this.panel = el("div", { class: "help-panel", attrs: { role: "dialog", "aria-label": "キーバインド" } }, [
      el("div", { class: "help-header" }, [
        el("span", { class: "help-title" }, [
          iconEl("keyboard", "", 18),
          el("span", { text: "キーバインド早見表" }),
        ]),
        el("button", {
          class: "help-close",
          text: "✕",
          attrs: { type: "button", "aria-label": "閉じる" },
          on: { click: () => this.hide() },
        }),
      ]),
      grid,
      el("div", {
        class: "help-foot",
        text: "各モードは ☰ メニューの「モード」から、またはシェルで tmux / nvim <file> / emacs <file> で起動できます。",
      }),
    ]);

    document.body.append(this.scrim, this.panel);
  }

  toggle(): void {
    this.opened ? this.hide() : this.show();
  }
  show(): void {
    this.opened = true;
    this.scrim.hidden = false;
    requestAnimationFrame(() => {
      this.scrim.classList.add("show");
      this.panel.classList.add("show");
    });
  }
  hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.scrim.classList.remove("show");
    this.panel.classList.remove("show");
    window.setTimeout(() => {
      if (!this.opened) this.scrim.hidden = true;
    }, 200);
  }
  get isOpen(): boolean {
    return this.opened;
  }
}
