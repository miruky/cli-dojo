import { clear, el } from "../util/dom";
import { iconEl } from "./icons";

/**
 * 初回訪問時のウェルカムツアー (3ステップのモーダル)。
 * 完了/スキップは localStorage に記録。`tour` コマンドや
 * window イベント "cli-dojo:open-tour" で再表示できる。
 */

const KEY_DONE = "cli-dojo.tour.done";

interface Step {
  icon: string;
  title: string;
  lines: string[];
  chips: string[];
}

const STEPS: Step[] = [
  {
    icon: "terminal-square",
    title: "ようこそ。ここは本物のシェルです",
    lines: [
      "cli-dojo はブラウザ内で本当に動く Linux 端末です。",
      "200 以上のコマンドが仮想ファイルシステム上で実際に動作します。",
      "Tab 補完・↑↓ 履歴・Ctrl-R 検索も使えます。まずは打ってみましょう:",
    ],
    chips: ["ls -la", "cat README.txt", "neofetch", "git status"],
  },
  {
    icon: "book",
    title: "学びの道具はぜんぶ揃っています",
    lines: [
      "左上の ☰ メニューから「レッスン」へ。基礎〜LPIC まで体系的に学べます。",
      "右上の「チートシート」は全コマンドの早見表。クリックで端末に挿入できます。",
      "コマンドの詳細はその場で引けます:",
    ],
    chips: ["man ls", "tldr tar", "vimtutor", "help"],
  },
  {
    icon: "award",
    title: "毎日鍛えて、帯を上げよう",
    lines: [
      "チャレンジ道場には全 50 問。実際に解くと自動判定され、帯が上がります (白帯 → 黒帯)。",
      "4 択クイズ 60 問・日替わりのデイリー修行・全コマンドのカード一問一答・あなた専用の統計も。",
      "進捗はブラウザに保存されます。今日の一歩から:",
    ],
    chips: ["challenge", "quiz", "cards", "daily", "stats"],
  },
];

export class WelcomeTour {
  private scrim: HTMLElement;
  private panel: HTMLElement;
  private body: HTMLElement;
  private dots: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private step = 0;
  private opened = false;

  constructor(private opts: { onInsert?: (cmd: string) => void } = {}) {
    this.body = el("div", { class: "tour-body" });
    this.dots = el("div", { class: "tour-dots" });

    this.backBtn = el("button", {
      class: "tour-btn tour-back",
      text: "戻る",
      attrs: { type: "button" },
      on: { click: () => this.go(this.step - 1) },
    }) as HTMLButtonElement;
    this.nextBtn = el("button", {
      class: "tour-btn tour-next",
      attrs: { type: "button" },
      on: {
        click: () => {
          if (this.step >= STEPS.length - 1) this.finish();
          else this.go(this.step + 1);
        },
      },
    }) as HTMLButtonElement;

    const skip = el("button", {
      class: "tour-skip",
      text: "スキップ",
      attrs: { type: "button" },
      on: { click: () => this.finish() },
    });

    const footer = el("div", { class: "tour-footer" }, [this.backBtn, this.dots, this.nextBtn]);
    this.panel = el("div", { class: "tour-panel", attrs: { role: "dialog", "aria-label": "ようこそ" } }, [
      skip,
      this.body,
      footer,
    ]);
    this.scrim = el("div", { class: "tour-scrim" }, [this.panel]);
    this.scrim.hidden = true;
    document.body.append(this.scrim);

    window.addEventListener("cli-dojo:open-tour" as keyof WindowEventMap, () => this.show());
    window.addEventListener("keydown", (e) => {
      if (this.opened && (e as KeyboardEvent).key === "Escape") this.finish();
    });
  }

  /** 初回のみ自動表示。 */
  maybeShow(): void {
    try {
      if (localStorage.getItem(KEY_DONE) === "1") return;
    } catch {
      /* storage 不可なら毎回出さず諦める */
      return;
    }
    this.show();
  }

  show(): void {
    this.opened = true;
    this.step = 0;
    this.scrim.hidden = false;
    requestAnimationFrame(() => this.scrim.classList.add("show"));
    this.render();
  }

  private finish(): void {
    try {
      localStorage.setItem(KEY_DONE, "1");
    } catch {
      /* 無視 */
    }
    this.opened = false;
    this.scrim.classList.remove("show");
    window.setTimeout(() => {
      if (!this.opened) this.scrim.hidden = true;
    }, 200);
  }

  private go(step: number): void {
    this.step = Math.max(0, Math.min(STEPS.length - 1, step));
    this.render();
  }

  private render(): void {
    const s = STEPS[this.step];
    clear(this.body);
    this.body.append(
      el("div", { class: "tour-icon" }, [iconEl(s.icon, "", 30)]),
      el("h2", { class: "tour-title", text: s.title }),
    );
    for (const line of s.lines) this.body.append(el("p", { class: "tour-line", text: line }));
    const chips = el("div", { class: "tour-chips" });
    for (const c of s.chips) {
      chips.append(
        el("button", {
          class: "tour-chip",
          text: c,
          attrs: { type: "button", title: "クリックで端末に挿入してツアーを閉じる" },
          on: {
            click: () => {
              this.finish();
              this.opts.onInsert?.(c);
            },
          },
        }),
      );
    }
    this.body.append(chips);

    clear(this.dots);
    STEPS.forEach((_, i) => {
      this.dots.append(el("span", { class: "tour-dot" + (i === this.step ? " on" : "") }));
    });
    this.backBtn.style.visibility = this.step === 0 ? "hidden" : "visible";
    this.nextBtn.textContent = this.step >= STEPS.length - 1 ? "始める" : "次へ";
  }
}
