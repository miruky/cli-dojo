import { clear, el } from "../util/dom";
import { iconEl } from "../ui/icons";
import {
  allCards,
  cardKey,
  expectedInput,
  isCorrect,
  loadMastered,
  saveMastered,
  type CommandCard,
} from "../lessons/cards";

/**
 * カード式一問一答。全コマンドが対象。
 * 問題文 + オプション名ヒント + カード下部のターミナル風入力。
 * 正解コマンドを打つと自動判定され、カードが滑らかに次へスライドする。
 */
export class CardsScreen {
  private root = el("div", { class: "cards" });
  private headEl = el("div", { class: "cards-head" });
  private stageEl = el("div", { class: "cards-stage" });
  private deck: CommandCard[] = [];
  private idx = 0;
  private mastered = loadMastered();
  private sessionOk = 0;
  private cat = "all";
  private onlyNew = false;
  private animating = false;
  private input: HTMLInputElement | null = null;

  mount(host: HTMLElement): void {
    host.append(this.root);
    this.root.append(this.headEl, this.stageEl);
    this.rebuildDeck();
    this.renderHead();
    this.renderStage(true);
  }

  /** ビュー表示時に呼ぶ (入力へフォーカス)。 */
  focus(): void {
    this.input?.focus();
  }

  // ===== デッキ =====

  private rebuildDeck(): void {
    let cards = allCards();
    if (this.cat !== "all") cards = cards.filter((c) => c.cat === this.cat);
    if (this.onlyNew) cards = cards.filter((c) => !this.mastered.has(cardKey(c)));
    // シャッフル
    const a = [...cards];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    this.deck = a;
    this.idx = 0;
    this.sessionOk = 0;
  }

  private restart(): void {
    this.rebuildDeck();
    this.renderHead();
    this.renderStage(true);
  }

  // ===== ヘッダ =====

  private renderHead(): void {
    clear(this.headEl);
    const cats = ["all", ...new Set(allCards().map((c) => c.cat))];
    const select = el("select", { class: "cards-filter", attrs: { "aria-label": "カテゴリ" } }) as HTMLSelectElement;
    for (const c of cats) {
      const opt = el("option", { text: c === "all" ? `すべて (${allCards().length})` : c }) as HTMLOptionElement;
      opt.value = c;
      if (c === this.cat) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener("change", () => {
      this.cat = select.value;
      this.restart();
    });

    const onlyNewBtn = el("button", {
      class: "cards-toggle" + (this.onlyNew ? " on" : ""),
      text: "未習得のみ",
      attrs: { type: "button", title: "まだ正解していないカードだけ出題" },
      on: {
        click: () => {
          this.onlyNew = !this.onlyNew;
          this.restart();
        },
      },
    });

    const shuffleBtn = el(
      "button",
      {
        class: "cards-toggle",
        attrs: { type: "button", title: "シャッフルしてやり直す" },
        on: { click: () => this.restart() },
      },
      [iconEl("grid", "", 13), el("span", { text: "シャッフル" })],
    );

    const total = allCards().length;
    const masteredCount = [...this.mastered].filter((k) => allCards().some((c) => cardKey(c) === k)).length;

    this.headEl.append(
      el("div", { class: "cards-titlewrap" }, [
        el("div", { class: "cards-kicker", text: "COMMAND FLASHCARDS" }),
        el("h1", { class: "cards-title", text: "カード一問一答" }),
        el("p", {
          class: "cards-sub",
          text: "お題のコマンドを下のターミナルに打つと自動判定。正解で次のカードへ。全コマンド収録、間違えても何も失いません。",
        }),
      ]),
      el("div", { class: "cards-controls" }, [
        select,
        onlyNewBtn,
        shuffleBtn,
        el("div", { class: "cards-mastered" }, [
          iconEl("award", "", 14),
          el("span", { text: `習得 ${masteredCount}/${total}` }),
        ]),
      ]),
      this.progressEl(),
    );
  }

  private progressEl(): HTMLElement {
    const done = Math.min(this.idx, this.deck.length);
    const pct = this.deck.length ? (done / this.deck.length) * 100 : 0;
    const bar = el("div", { class: "cards-progress" }, [
      el("div", { class: "cards-progress-fill", style: `width:${pct}%` }),
    ]);
    return el("div", { class: "cards-progresswrap" }, [
      bar,
      el("span", { class: "cards-progress-label", text: `${done} / ${this.deck.length}` }),
    ]);
  }

  // ===== ステージ =====

  private renderStage(initial = false): void {
    clear(this.stageEl);
    if (this.deck.length === 0) {
      this.stageEl.append(
        el("div", { class: "card card-done" }, [
          el("div", { class: "card-done-icon" }, [iconEl("award", "", 36)]),
          el("h2", { text: "このカテゴリは全カード習得済み!" }),
          el("p", { class: "card-done-sub", text: "「未習得のみ」を外すか、別のカテゴリでもう一周どうぞ。" }),
        ]),
      );
      return;
    }
    if (this.idx >= this.deck.length) {
      this.stageEl.append(
        el("div", { class: "card card-done card-enter" }, [
          el("div", { class: "card-done-icon" }, [iconEl("award", "", 36)]),
          el("h2", { text: "一周完了!" }),
          el("p", {
            class: "card-done-sub",
            text: `このセッションの正解: ${this.sessionOk} / ${this.deck.length} 枚`,
          }),
          el("div", { class: "card-done-actions" }, [
            el("button", {
              class: "cards-toggle",
              text: "もう一周 (シャッフル)",
              attrs: { type: "button" },
              on: { click: () => this.restart() },
            }),
            el("button", {
              class: "cards-toggle",
              text: "未習得のみで再挑戦",
              attrs: { type: "button" },
              on: {
                click: () => {
                  this.onlyNew = true;
                  this.restart();
                },
              },
            }),
          ]),
        ]),
      );
      requestAnimationFrame(() => this.stageEl.querySelector(".card-enter")?.classList.remove("card-enter"));
      return;
    }

    // 奥のカード (深さの演出)
    this.stageEl.append(el("div", { class: "card card-back card-back2" }));
    this.stageEl.append(el("div", { class: "card card-back card-back1" }));

    const card = this.buildCard(this.deck[this.idx]);
    if (!initial) card.classList.add("card-enter");
    this.stageEl.append(card);
    if (!initial) {
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("card-enter")));
    }
    window.setTimeout(() => this.input?.focus(), 30);
  }

  private buildCard(c: CommandCard): HTMLElement {
    const expected = expectedInput(c);
    const badge = el("div", { class: "card-cat", text: c.cat });
    const counter = el("div", { class: "card-counter", text: `${this.idx + 1} / ${this.deck.length}` });
    const q = el("div", { class: "card-q", text: c.q });

    const hint = el("div", { class: "card-hint" });
    if (c.args) {
      hint.append(
        el("span", { class: "card-hint-label", text: "オプション / 引数:" }),
        el("code", { class: "card-hint-args", text: c.args }),
      );
    } else {
      hint.append(el("span", { class: "card-hint-label card-hint-none", text: "コマンド名のみで OK" }));
    }

    const answer = el("div", { class: "card-answer" }, [
      el("span", { text: "答え: " }),
      el("code", { text: expected }),
    ]);
    answer.hidden = true;
    const reveal = el("button", {
      class: "card-reveal",
      text: "答えを見る",
      attrs: { type: "button" },
      on: {
        click: () => {
          answer.hidden = false;
          reveal.hidden = true;
          this.input?.focus();
        },
      },
    });

    const ok = el("div", { class: "card-okbadge" }, [iconEl("award", "", 18), el("span", { text: "正解!" })]);

    const input = el("input", {
      class: "card-input",
      attrs: {
        type: "text",
        placeholder: "ここにコマンドを入力…",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
    }) as HTMLInputElement;
    this.input = input;

    const term = el("div", { class: "card-term" }, [
      el("span", { class: "card-prompt", text: "❯" }),
      input,
    ]);

    const cardEl = el("div", { class: "card card-top" }, [
      el("div", { class: "card-toprow" }, [badge, counter]),
      q,
      el("div", { class: "card-blank" }),
      hint,
      el("div", { class: "card-answerrow" }, [reveal, answer]),
      ok,
      term,
      el("div", { class: "card-actions" }, [
        el("button", {
          class: "card-skip",
          text: "スキップ →",
          attrs: { type: "button", title: "あとで戻ってこられます (ペナルティなし)" },
          on: { click: () => this.advance(false) },
        }),
      ]),
    ]);

    input.addEventListener("input", () => {
      term.classList.remove("term-shake");
      if (isCorrect(c, input.value)) this.succeed(cardEl, term, c);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !isCorrect(c, input.value)) {
        // 失敗ペナルティなし。そっと揺れるだけ。
        term.classList.remove("term-shake");
        void term.offsetWidth; // リフローでアニメ再発火
        term.classList.add("term-shake");
      }
    });

    return cardEl;
  }

  private succeed(cardEl: HTMLElement, term: HTMLElement, c: CommandCard): void {
    if (this.animating) return;
    this.animating = true;
    this.input!.disabled = true;
    cardEl.classList.add("card-ok");
    term.classList.add("term-ok");
    this.mastered.add(cardKey(c));
    saveMastered(this.mastered);
    this.sessionOk++;
    window.setTimeout(() => this.advance(true), 700);
  }

  private advance(success: boolean): void {
    if (!success) {
      if (this.animating) return; // スキップ連打ガード
      this.animating = true;
    }
    const top = this.stageEl.querySelector(".card-top");
    if (top) {
      top.classList.add(success ? "card-fly-ok" : "card-fly-skip");
    }
    window.setTimeout(() => {
      this.animating = false;
      this.idx++;
      this.renderHead();
      this.renderStage();
    }, success ? 380 : 320);
  }
}
