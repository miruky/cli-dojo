import type { Command } from "../types";
import { loadWrong, loadStreak } from "../../../lessons/quiz";
import { CHALLENGES, beltFor } from "../../../lessons/challenges";
import { loadCleared } from "./challenge";
import { loadUsage } from "../usage";

/** 学習系コマンド: quiz (4択クイズ) / daily (デイリー修行) / vimtutor (vim チュートリアル)。 */

const TUTOR_PATH = "/home/guest/tutor.txt";

const TUTOR_TEXT = `===============================================================
=    V I M チ ュ ー ト リ ア ル  (cli-dojo 凝縮版)            =
===============================================================

 vim はモードを持つエディタです。このファイルは実際に vim で
 開かれています。書かれている通りに手を動かして覚えましょう。

 ~~ レッスン 1: カーソル移動 ~~

  カーソルは h j k l で動かします。
        ^
        k        ヒント: h は左端、l は右端。
   < h     l >          j は下向きの矢印に見える。
        j
        v
  >>> j を何回か押して、このファイルを下に読み進めてください。

 ~~ レッスン 2: 終了の仕方 (最重要!) ~~

  :q!   = 保存せずに終了 (今は押さないで!)
  :wq   = 保存して終了
  ZZ    = :wq と同じ

 ~~ レッスン 3: 削除 ~~

  x  = カーソル位置の 1 文字を削除
  >>> 次の行の余分な文字を x で消して「cat file」にしてください:

      ccaaat ffiile

  dd = 行ごと削除
  dw = 単語を削除
  >>> 次の不要な行を dd で消してください:

      この行は不要です。dd で消しましょう。

 ~~ レッスン 4: 挿入 ~~

  i  = カーソルの前から入力開始    a = カーソルの後ろから
  o  = 下に新しい行を作って入力    Esc = ノーマルモードへ戻る
  >>> 次の行を「I love vim」に直してください (i で挿入):

      I lv vim

 ~~ レッスン 5: コピー & ペースト ~~

  yy = 行をコピー (ヤンク)    p = 貼り付け
  dd = 行を削除 (カット)      P = 上に貼り付け
  >>> 次の行を yy → p で複製してみてください:

      この行を複製せよ

 ~~ レッスン 6: 検索と置換 ~~

  /word  = 下方向に word を検索 (n で次へ, N で前へ)
  :%s/old/new/g = ファイル全体で old を new に置換
  >>> /apple と打って、この単語を探してみてください: apple

 ~~ レッスン 7: ジャンプ ~~

  gg = ファイルの先頭へ    G = 末尾へ    42G = 42行目へ
  0  = 行頭へ    $ = 行末へ    w / b = 次/前の単語へ

 ~~ 卒業 ~~

  ここまでの操作が手に馴染んだら、:wq で保存終了してください。
  さらに上を目指すなら: ciw (単語を書き換え), u (undo),
  Ctrl-r (redo), . (直前の変更を繰り返す) を試しましょう。

  道場のチャレンジ (challenge 21〜24) はエディタ問題です。腕試しに!
===============================================================
`;

const quiz: Command = {
  name: "quiz",
  summary: "Linux 4択クイズ (quiz <数> / quiz review=復習)",
  run(ctx) {
    if (!ctx.tty) {
      ctx.err("quiz: 端末でないと起動できません\n");
      return 1;
    }
    const arg = ctx.args[1];
    if (arg === "review" || arg === "-r" || arg === "--review") {
      const wrong = loadWrong();
      if (wrong.size === 0) {
        ctx.out("復習する問題はありません。全問正解状態です! (quiz で新しい問題へ)\n");
        return 0;
      }
      ctx.services.launch("quiz", [], { mode: "review" });
      return 0;
    }
    const nArg = parseInt(arg ?? "", 10);
    const count = Number.isFinite(nArg) && nArg > 0 ? Math.min(nArg, 60) : 10;
    ctx.services.launch("quiz", [], { mode: "normal", count });
    return 0;
  },
};

const daily: Command = {
  name: "daily",
  summary: "デイリー修行 (日替わり5問・連続日数を記録)",
  run(ctx) {
    if (!ctx.tty) {
      ctx.err("daily: 端末でないと起動できません\n");
      return 1;
    }
    const { streak, doneToday } = loadStreak();
    if (doneToday) {
      ctx.out(`\x1b[38;2;255;198;0m🔥 今日の修行は完了済みです (連続 ${streak} 日)。\x1b[0m もう一周は自由稽古としてどうぞ。\n`);
    }
    ctx.services.launch("quiz", [], { mode: "daily" });
    return 0;
  },
};

const vimtutor: Command = {
  name: "vimtutor",
  summary: "vim チュートリアル (実際に手を動かして学ぶ)",
  run(ctx) {
    // 毎回まっさらなチュートリアルを配置 (本家も一時コピーを開く)
    const node = ctx.vfs.stat(TUTOR_PATH);
    if (node && node.type === "file") node.content = TUTOR_TEXT;
    else ctx.vfs.createFile(TUTOR_PATH, TUTOR_TEXT);
    if (!ctx.tty) {
      ctx.out(TUTOR_TEXT);
      return 0;
    }
    ctx.services.launch("vim", [TUTOR_PATH]);
    return 0;
  },
};

const stats: Command = {
  name: "stats",
  summary: "あなたの修行統計 (使用コマンド/道場/クイズ/連続日数)",
  run(ctx) {
    const R = "\x1b[0m";
    const B = "\x1b[1m";
    const DIM = "\x1b[38;2;120;128;150m";
    const GREEN = "\x1b[38;2;126;214;126m";
    const YELLOW = "\x1b[38;2;255;198;0m";
    const CYAN = "\x1b[38;2;24;179;199m";

    const usage = loadUsage();
    const cleared = loadCleared();
    const [belt, beltColor] = beltFor(cleared.size);
    const { streak, doneToday } = loadStreak();
    const wrong = loadWrong();
    let best = 0;
    try {
      best = parseInt(localStorage.getItem("cli-dojo.quiz.best") ?? "0", 10) || 0;
    } catch {
      /* なし */
    }

    ctx.out(`\n  ${B}📊 あなたの修行統計${R}\n\n`);
    // サマリ
    ctx.out(`  段位:         ${beltColor}${B}${belt}${R}  (チャレンジ ${cleared.size}/${CHALLENGES.length})\n`);
    ctx.out(`  クイズベスト: ${B}${best}%${R}${wrong.size ? `  ${DIM}(復習待ち ${wrong.size}問 → quiz review)${R}` : ""}\n`);
    ctx.out(
      `  デイリー修行: ${streak > 0 ? YELLOW + "🔥 連続 " + streak + " 日" + R : DIM + "未挑戦 (daily で開始)" + R}` +
        `${doneToday ? `  ${GREEN}今日は完了済${R}` : streak > 0 ? `  ${DIM}今日はまだ → daily${R}` : ""}\n`,
    );
    ctx.out(`  実行コマンド: ${B}${usage.total}${R} 回  ${DIM}(ユニーク ${Object.keys(usage.counts).length} 種類)${R}\n`);

    // TOP 10
    const top = Object.entries(usage.counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top.length > 0) {
      ctx.out(`\n  ${B}よく使うコマンド TOP${top.length}${R}\n`);
      const max = top[0][1];
      const nameW = Math.max(...top.map(([n]) => n.length));
      top.forEach(([name, count], i) => {
        const barW = Math.max(1, Math.round((count / max) * 24));
        const color = i < 3 ? GREEN : CYAN;
        ctx.out(`   ${String(i + 1).padStart(2)}. ${name.padEnd(nameW)} ${color}${"▇".repeat(barW)}${R} ${count}\n`);
      });
    } else {
      ctx.out(`\n  ${DIM}まだコマンド履歴がありません。打てば打つほどここが育ちます。${R}\n`);
    }
    ctx.out(`\n${DIM}  次の一手: challenge (道場) / quiz (4択) / daily (日課) / vimtutor${R}\n\n`);
    return 0;
  },
};

export const learnCommands: Command[] = [quiz, daily, vimtutor, stats];
