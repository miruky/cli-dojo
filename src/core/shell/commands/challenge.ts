import type { Command, ExecContext } from "../types";
import { CHALLENGES, BELTS, beltFor, type Challenge } from "../../../lessons/challenges";

/** チャレンジ道場: 出題 → 端末で実際に解く → check/answer で自動判定 → 帯が上がる。 */

const R = "\x1b[0m";
const B = "\x1b[1m";
const DIM = "\x1b[38;2;120;128;150m";
const GREEN = "\x1b[38;2;126;214;126m";
const YELLOW = "\x1b[38;2;255;198;0m";
const CYAN = "\x1b[38;2;24;179;199m";
const RED = "\x1b[38;2;255;98;140m";
const MAGENTA = "\x1b[38;2;251;148;255m";

const KEY_CLEARED = "cli-dojo.challenges.cleared";
const KEY_CURRENT = "cli-dojo.challenges.current";

function loadCleared(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY_CLEARED) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
function saveCleared(s: Set<number>): void {
  try {
    localStorage.setItem(KEY_CLEARED, JSON.stringify([...s].sort((a, b) => a - b)));
  } catch {
    /* storage 不可なら進捗はセッション内のみ */
  }
}
function loadCurrent(): number | null {
  try {
    const v = localStorage.getItem(KEY_CURRENT);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}
function saveCurrent(id: number): void {
  try {
    localStorage.setItem(KEY_CURRENT, String(id));
  } catch {
    /* 無視 */
  }
}

function stars(level: number): string {
  return YELLOW + "★".repeat(level) + DIM + "☆".repeat(3 - level) + R;
}

function progressBar(cleared: number, total: number, width = 24): string {
  const fill = Math.round((cleared / total) * width);
  const [, color] = beltFor(cleared);
  return `${color}${"█".repeat(fill)}${DIM}${"░".repeat(width - fill)}${R} ${cleared}/${total}`;
}

function showChallenge(ctx: ExecContext, c: Challenge, cleared: Set<number>): void {
  const mark = cleared.has(c.id) ? GREEN + " ✔ クリア済" + R : "";
  ctx.out(`\n${B}${CYAN}━━ 問${c.id} ${stars(c.level)} ${c.title}${R}${mark}\n`);
  ctx.out(`${DIM}[${c.cat}]${R}\n\n`);
  for (const line of c.task) ctx.out("  " + line + "\n");
  ctx.out("\n");
  ctx.out(`${DIM}  判定: ${c.answer ? "answer <値> で回答" : "操作したら check"} / ヒント: hint / 一覧: challenge${R}\n\n`);
}

function clearAndCelebrate(ctx: ExecContext, c: Challenge, cleared: Set<number>): void {
  const before = beltFor(cleared.size)[0];
  cleared.add(c.id);
  saveCleared(cleared);
  const [belt, color] = beltFor(cleared.size);
  ctx.out(`${GREEN}${B}✔ 正解! 問${c.id}「${c.title}」クリア!${R}\n`);
  ctx.out(`  ${progressBar(cleared.size, CHALLENGES.length)}\n`);
  if (belt !== before) {
    ctx.out(`\n  ${color}${B}🥋 昇段! あなたは ${belt} になりました!${R}\n`);
  }
  const next = CHALLENGES.find((x) => !cleared.has(x.id));
  if (next) ctx.out(`${DIM}  次へ: challenge ${next.id}${R}\n`);
  else ctx.out(`\n  ${B}${MAGENTA}全問制覇!! あなたはもう道場の主です。${R}\n`);
}

const challenge: Command = {
  name: "challenge",
  summary: "チャレンジ道場: 出題一覧 / challenge <番号> で挑戦",
  run(ctx) {
    const cleared = loadCleared();
    const arg = ctx.args[1];
    if (arg) {
      const id = parseInt(arg, 10);
      const c = CHALLENGES.find((x) => x.id === id);
      if (!c) {
        ctx.err(`challenge: 問${arg} はありません (1〜${CHALLENGES.length})\n`);
        return 1;
      }
      saveCurrent(id);
      showChallenge(ctx, c, cleared);
      return 0;
    }
    const [belt, color] = beltFor(cleared.size);
    ctx.out(`\n  ${B}🥋 チャレンジ道場${R}  ${color}${B}${belt}${R}  ${progressBar(cleared.size, CHALLENGES.length)}\n`);
    ctx.out(`${DIM}  challenge <番号> で出題 → 端末で実際に解く → check / answer <値> で判定${R}\n`);
    let cat = "";
    for (const c of CHALLENGES) {
      if (c.cat !== cat) {
        cat = c.cat;
        ctx.out(`\n  ${B}${CYAN}■ ${cat}${R}\n`);
      }
      const mark = cleared.has(c.id) ? GREEN + "✔" + R : DIM + "・" + R;
      ctx.out(`   ${mark} ${String(c.id).padStart(2)}. ${stars(c.level)} ${cleared.has(c.id) ? DIM : ""}${c.title}${R}\n`);
    }
    ctx.out("\n");
    return 0;
  },
};

function currentChallenge(ctx: ExecContext): Challenge | null {
  const id = loadCurrent();
  if (id == null) {
    ctx.err("挑戦中の問題がありません。challenge <番号> で出題してください。\n");
    return null;
  }
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c) {
    ctx.err("挑戦中の問題が見つかりません。challenge で一覧を確認してください。\n");
    return null;
  }
  return c;
}

const check: Command = {
  name: "check",
  summary: "挑戦中のチャレンジを判定",
  run(ctx) {
    const c = currentChallenge(ctx);
    if (!c) return 1;
    if (c.answer) {
      ctx.err(`問${c.id} は answer <値> で回答する問題です。\n`);
      return 1;
    }
    const result = c.verify!(ctx);
    if (result === true) {
      clearAndCelebrate(ctx, c, loadCleared());
      return 0;
    }
    ctx.out(`${RED}✘ まだです:${R} ${result}\n${DIM}  (hint でヒント / challenge ${c.id} で問題を再表示)${R}\n`);
    return 1;
  },
};

const answer: Command = {
  name: "answer",
  summary: "チャレンジの答えを回答 (answer <値>)",
  run(ctx) {
    const c = currentChallenge(ctx);
    if (!c) return 1;
    if (!c.answer) {
      ctx.err(`問${c.id} は端末で操作して check で判定する問題です。\n`);
      return 1;
    }
    const given = ctx.args.slice(1).join(" ").trim();
    if (!given) {
      ctx.err("使い方: answer <値>  (例: answer 42)\n");
      return 1;
    }
    const expected = c.answer(ctx).trim();
    if (given === expected || given.toLowerCase() === expected.toLowerCase()) {
      clearAndCelebrate(ctx, c, loadCleared());
      return 0;
    }
    ctx.out(`${RED}✘ 不正解。${R} もう一度コマンドで確かめてみよう。${DIM}(hint でヒント)${R}\n`);
    return 1;
  },
};

const hint: Command = {
  name: "hint",
  summary: "挑戦中のチャレンジのヒント",
  run(ctx) {
    const c = currentChallenge(ctx);
    if (!c) return 1;
    ctx.out(`${YELLOW}💡 ヒント (問${c.id}):${R} ${c.hint}\n`);
    return 0;
  },
};

const dojo: Command = {
  name: "dojo",
  summary: "道場の段位と進捗を表示",
  run(ctx) {
    const cleared = loadCleared();
    const [belt, color] = beltFor(cleared.size);
    ctx.out("\n");
    ctx.out(`  ${B}🥋 cli-dojo 段位認定${R}\n\n`);
    ctx.out(`  現在の段位: ${color}${B}${belt}${R}\n`);
    ctx.out(`  進捗:       ${progressBar(cleared.size, CHALLENGES.length)}\n\n`);
    // カテゴリ別
    const cats = [...new Set(CHALLENGES.map((c) => c.cat))];
    for (const cat of cats) {
      const all = CHALLENGES.filter((c) => c.cat === cat);
      const done = all.filter((c) => cleared.has(c.id)).length;
      const mark = done === all.length ? GREEN + "✔" + R : DIM + "…" + R;
      ctx.out(`   ${mark} ${cat.padEnd(10)} ${done}/${all.length}\n`);
    }
    ctx.out(`\n${DIM}  帯の基準: ${BELTS.map(([n, name]) => `${name}=${n}問`).join(" → ")}${R}\n`);
    const next = CHALLENGES.find((x) => !cleared.has(x.id));
    if (next) ctx.out(`${DIM}  次の挑戦: challenge ${next.id}${R}\n`);
    ctx.out("\n");
    return 0;
  },
};

export const challengeCommands: Command[] = [challenge, check, answer, hint, dojo];
