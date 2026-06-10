import type { TerminalView } from "../terminal/TerminalView";
import { loadWrong, saveWrong, type QuizQuestion } from "../../lessons/quiz";
import { padAnsi } from "./util";
import { charWidth } from "../terminal/wcwidth";

export interface QuizOptions {
  term: TerminalView;
  /** 出題セット (selectQuiz で組み立てる)。 */
  questions: QuizQuestion[];
  /** ヘッダ/結果に出すタイトル。 */
  title: string;
  /** 全問終了 (結果画面到達) 時に呼ぶ。返した行を結果に追記表示。 */
  onFinish?: (score: number, total: number) => string[] | void;
  onExit: () => void;
}

const R = "\x1b[0m";
const B = "\x1b[1m";
const DIM = "\x1b[38;2;120;128;150m";
const GREEN = "\x1b[38;2;126;214;126m";
const YELLOW = "\x1b[38;2;255;198;0m";
const CYAN = "\x1b[38;2;24;179;199m";
const RED = "\x1b[38;2;255;98;140m";
const MAGENTA = "\x1b[38;2;251;148;255m";

const KEY_BEST = "cli-dojo.quiz.best";

/** 表示幅で日本語テキストを折り返す。 */
function wrapJp(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  let w = 0;
  for (const ch of text) {
    const cw = charWidth(ch);
    if (w + cw > width) {
      out.push(line);
      line = "";
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** LPIC 風 4 択クイズ。1-4 で回答 → 即フィードバック → スコア画面。 */
export class QuizApp {
  private term: TerminalView;
  private onExit: () => void;
  private onFinish?: QuizOptions["onFinish"];
  private title: string;
  private questions: QuizQuestion[];
  private index = 0;
  private score = 0;
  private phase: "question" | "feedback" | "result" = "question";
  private selected = -1;
  private resultNote: string[] = [];
  private done = false;

  constructor(opts: QuizOptions) {
    this.term = opts.term;
    this.onExit = opts.onExit;
    this.onFinish = opts.onFinish;
    this.title = opts.title;
    this.questions = opts.questions;
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l");
    this.render();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.render();
  }

  onData(data: string): void {
    if (data === "q" || data === "\x03") {
      if (this.phase === "result" || this.phase === "question") {
        this.quit();
        return;
      }
      // feedback 中の q は次へ進む扱いにしない → 終了
      this.quit();
      return;
    }
    if (this.phase === "question") {
      const n = parseInt(data, 10);
      if (n >= 1 && n <= this.questions[this.index].options.length) {
        const q = this.questions[this.index];
        this.selected = n - 1;
        const correct = this.selected === q.answer;
        if (correct) this.score++;
        // 間違い記録: 不正解なら復習リストへ、正解なら卒業
        const wrong = loadWrong();
        if (correct) wrong.delete(q.q);
        else wrong.add(q.q);
        saveWrong(wrong);
        this.phase = "feedback";
        this.render();
      }
      return;
    }
    if (this.phase === "feedback") {
      if (data === "\r" || data === " " || data === "n") {
        if (this.index + 1 >= this.questions.length) {
          this.phase = "result";
          this.saveBest();
          this.resultNote = this.onFinish?.(this.score, this.questions.length) ?? [];
        } else {
          this.index++;
          this.selected = -1;
          this.phase = "question";
        }
        this.render();
      }
      return;
    }
    if (this.phase === "result" && (data === "\r" || data === " ")) {
      this.quit();
    }
  }

  private quit(): void {
    this.dispose();
    this.onExit();
  }

  private best(): number {
    try {
      return parseInt(localStorage.getItem(KEY_BEST) ?? "0", 10) || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(): void {
    try {
      const pct = Math.round((this.score / this.questions.length) * 100);
      if (pct > this.best()) localStorage.setItem(KEY_BEST, String(pct));
    } catch {
      /* 保存できなくてもプレイは可能 */
    }
  }

  private render(): void {
    const t = this.term.term;
    const cols = this.term.cols;
    const rows = this.term.rows;
    const width = Math.min(cols - 6, 76);
    const lines: string[] = [];
    lines.push("");

    if (this.phase === "result") {
      const pct = Math.round((this.score / this.questions.length) * 100);
      const grade =
        pct === 100 ? `${MAGENTA}${B}完璧!! 道場の看板を譲りましょう。${R}`
        : pct >= 80 ? `${GREEN}${B}素晴らしい! 黒帯クラスの知識です。${R}`
        : pct >= 60 ? `${YELLOW}いい線です。間違えた所を man で復習しよう。${R}`
        : `${CYAN}伸びしろしかない! レッスンから再挑戦しよう。${R}`;
      lines.push(`  ${B}📝 ${this.title} — 結果${R}`);
      lines.push("");
      const barW = 30;
      const fill = Math.round((this.score / this.questions.length) * barW);
      lines.push(`  正解: ${B}${this.score} / ${this.questions.length}${R}  (${pct}%)`);
      lines.push(`  ${GREEN}${"█".repeat(fill)}${DIM}${"░".repeat(barW - fill)}${R}`);
      lines.push("");
      lines.push("  " + grade);
      for (const l of this.resultNote) lines.push("  " + l);
      lines.push("");
      const wrongCount = loadWrong().size;
      lines.push(`  ${DIM}ベストスコア: ${Math.max(this.best(), pct)}%${wrongCount ? `  /  復習待ち: ${wrongCount}問 (quiz review)` : ""}${R}`);
      lines.push("");
      lines.push(`  ${DIM}Enter で終了 / もう一度: quiz${R}`);
    } else {
      const q = this.questions[this.index];
      lines.push(
        `  ${B}📝 ${this.title}${R}  ${DIM}問 ${this.index + 1}/${this.questions.length}  [${q.cat}]  スコア ${this.score}${R}`,
      );
      lines.push("  " + DIM + "─".repeat(Math.min(cols - 4, 78)) + R);
      lines.push("");
      for (const l of wrapJp(q.q, width)) lines.push("  " + B + l + R);
      lines.push("");
      q.options.forEach((opt, i) => {
        let prefix = `   ${CYAN}${i + 1})${R} `;
        let body = opt;
        if (this.phase === "feedback") {
          if (i === q.answer) {
            prefix = `   ${GREEN}${B}✔ ${i + 1})${R} `;
            body = `${GREEN}${opt}${R}`;
          } else if (i === this.selected) {
            prefix = `   ${RED}✘ ${i + 1})${R} `;
            body = `${RED}${opt}${R}`;
          } else {
            body = `${DIM}${opt}${R}`;
          }
        }
        lines.push(prefix + body);
      });
      lines.push("");
      if (this.phase === "feedback") {
        const ok = this.selected === q.answer;
        lines.push(ok ? `  ${GREEN}${B}正解!${R}` : `  ${RED}${B}残念!${R} 正解は ${GREEN}${q.answer + 1}) ${q.options[q.answer]}${R}`);
        lines.push("");
        for (const l of wrapJp("💡 " + q.why, width)) lines.push("  " + YELLOW + l + R);
        lines.push("");
        lines.push(`  ${DIM}Enter / Space で${this.index + 1 >= this.questions.length ? "結果へ" : "次の問題へ"} (q で中断)${R}`);
      } else {
        lines.push(`  ${DIM}1〜${q.options.length} のキーで回答 (q で中断)${R}`);
      }
    }

    let buf = "\x1b[H";
    for (let r = 0; r < rows; r++) {
      buf += padAnsi(r < lines.length ? lines[r] : "", cols) + (r < rows - 1 ? "\r\n" : "");
    }
    t.write(buf);
  }
}
