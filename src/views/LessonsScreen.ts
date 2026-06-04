import { clear, el } from "../util/dom";
import { iconEl } from "../ui/icons";
import { LESSONS, type CheatItem, type Lesson } from "../lessons/data";

export interface LessonsOptions {
  onTry: (cmd: string) => void;
}

/** レッスン/チートシート画面: ナビ + 検索 + 「Try」で端末へ送信。 */
export class LessonsScreen {
  private root = el("div", { class: "lessons" });
  private navEl = el("div", { class: "lessons-nav" });
  private contentEl = el("div", { class: "lessons-content" });
  private searchInput!: HTMLInputElement;
  private current = LESSONS[0].id;
  private query = "";

  constructor(private opts: LessonsOptions) {}

  mount(host: HTMLElement): void {
    host.append(this.root);
    this.build();
  }

  private build(): void {
    this.searchInput = el("input", {
      class: "lessons-search",
      attrs: { type: "text", placeholder: "コマンド/説明を検索… (例: grep, 権限, 置換)" },
    }) as HTMLInputElement;
    this.searchInput.addEventListener("input", () => {
      this.query = this.searchInput.value.trim();
      this.renderContent();
    });

    const header = el("div", { class: "lessons-head" }, [
      el("div", { class: "lessons-kicker", text: "LESSONS & CHEAT SHEET" }),
      el("h1", { class: "lessons-title", text: "レッスン & チートシート" }),
      el("p", {
        class: "lessons-sub",
        text: "各コマンドの「Try」で端末に送って実行できます。配置済みのファイル(todo.txt, data/, logs/ …)で実際に動きます。",
      }),
      this.searchInput,
    ]);

    const layout = el("div", { class: "lessons-layout" }, [this.navEl, this.contentEl]);
    this.root.append(header, layout);
    this.renderNav();
    this.renderContent();
  }

  private renderNav(): void {
    clear(this.navEl);
    const groups = new Map<string, Lesson[]>();
    for (const l of LESSONS) {
      if (!groups.has(l.group)) groups.set(l.group, []);
      groups.get(l.group)!.push(l);
    }
    for (const [group, lessons] of groups) {
      this.navEl.append(el("div", { class: "lessons-nav-group", text: group }));
      for (const l of lessons) {
        const btn = el(
          "button",
          {
            class: "lessons-nav-item" + (l.id === this.current && !this.query ? " active" : ""),
            attrs: { type: "button" },
            style: `--accent:${l.accent}`,
            on: {
              click: () => {
                this.current = l.id;
                this.query = "";
                this.searchInput.value = "";
                this.renderNav();
                this.renderContent();
              },
            },
          },
          [
            iconEl(l.icon, "lessons-nav-glyph", 17),
            el("span", { text: l.title }),
          ],
        );
        this.navEl.append(btn);
      }
    }
  }

  private renderContent(): void {
    clear(this.contentEl);
    if (this.query) {
      this.renderSearch();
      return;
    }
    const lesson = LESSONS.find((l) => l.id === this.current) ?? LESSONS[0];
    this.contentEl.append(
      el("div", { class: "lesson-header", style: `--accent:${lesson.accent}` }, [
        iconEl(lesson.icon, "lesson-header-glyph", 26),
        el("div", {}, [
          el("h2", { class: "lesson-header-title", text: lesson.title }),
          el("p", { class: "lesson-header-intro", text: lesson.intro }),
        ]),
      ]),
    );
    for (const section of lesson.sections) {
      this.contentEl.append(el("h3", { class: "lesson-section-title", text: section.title }));
      const grid = el("div", { class: "lesson-items" });
      for (const item of section.items) grid.append(this.itemRow(item, lesson.accent));
      this.contentEl.append(grid);
    }
  }

  private renderSearch(): void {
    const q = this.query.toLowerCase();
    const results: Array<{ lesson: Lesson; item: CheatItem }> = [];
    for (const lesson of LESSONS) {
      for (const section of lesson.sections) {
        for (const item of section.items) {
          if (item.cmd.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)) {
            results.push({ lesson, item });
          }
        }
      }
    }
    this.contentEl.append(
      el("h2", { class: "lesson-header-title", text: `検索結果: ${results.length} 件` }),
    );
    if (results.length === 0) {
      this.contentEl.append(el("p", { class: "lesson-header-intro", text: "一致する項目がありません。" }));
      return;
    }
    const grid = el("div", { class: "lesson-items" });
    for (const { lesson, item } of results) {
      grid.append(this.itemRow(item, lesson.accent, lesson.title));
    }
    this.contentEl.append(grid);
  }

  private itemRow(item: CheatItem, accent: string, tag?: string): HTMLElement {
    const left = el("div", { class: "lesson-item-left" }, [
      el("code", { class: "lesson-cmd", style: `--accent:${accent}`, text: item.cmd }),
      el("span", { class: "lesson-desc", text: item.desc }),
      ...(tag ? [el("span", { class: "lesson-tag", text: tag })] : []),
    ]);
    const right = el("div", { class: "lesson-item-right" });
    if (!item.keys) {
      right.append(
        el("button", {
          class: "lesson-try",
          text: "▶ Try",
          attrs: { type: "button", title: "端末で実行" },
          on: { click: () => this.opts.onTry(item.cmd) },
        }),
      );
    } else {
      right.append(el("span", { class: "lesson-keys-badge", text: "キー" }));
    }
    return el("div", { class: "lesson-item" + (item.keys ? " is-keys" : "") }, [left, right]);
  }
}
