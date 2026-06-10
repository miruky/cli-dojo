import type { Command } from "../types";

/** 学習系コマンド: quiz (4択クイズアプリ) / vimtutor (vim チュートリアル)。 */

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
  summary: "Linux 4択クイズ (ランダム10問・解説付き)",
  run(ctx) {
    if (!ctx.tty) {
      ctx.err("quiz: 端末でないと起動できません\n");
      return 1;
    }
    const nArg = parseInt(ctx.args[1] ?? "", 10);
    const count = Number.isFinite(nArg) && nArg > 0 ? Math.min(nArg, 36) : 10;
    ctx.services.launch("quiz", [], { count });
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

export const learnCommands: Command[] = [quiz, vimtutor];
