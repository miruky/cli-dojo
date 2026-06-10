import type { ExecContext } from "../core/shell/types";
import { repoSnapshot } from "../core/shell/commands/git";

/**
 * チャレンジ道場の問題データ。
 * - verify 型: VFS / 環境の状態を検査して合否判定 (check コマンド)
 * - answer 型: 期待値を「その時点の VFS から動的に計算」して照合 (answer コマンド)
 *   → seed を変えても答えがズレない。
 */

export interface Challenge {
  id: number;
  cat: string;
  /** ★の数 (1-3) */
  level: number;
  title: string;
  task: string[];
  hint: string;
  /** answer 型: 期待値を計算して返す */
  answer?: (ctx: ExecContext) => string;
  /** verify 型: true=合格 / string=不合格の理由 */
  verify?: (ctx: ExecContext) => true | string;
}

const HOME = "/home/guest";

function fileLines(ctx: ExecContext, abs: string): string[] {
  const node = ctx.vfs.stat(abs);
  if (!node || node.type !== "file") return [];
  const lines = node.content.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export const CHALLENGES: Challenge[] = [
  // ===== 基礎 =====
  {
    id: 1, cat: "基礎", level: 1,
    title: "ディレクトリを作る",
    task: ["ホームディレクトリ (~) に training という名前のディレクトリを作成せよ。", "できたら check で判定。"],
    hint: "mkdir ~/training (どこにいても ~ はホームを指す)",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/training`);
      if (!n) return "~/training がまだ存在しません。";
      if (n.type !== "dir") return "~/training がディレクトリではありません。";
      return true;
    },
  },
  {
    id: 2, cat: "基礎", level: 1,
    title: "ファイルをコピーする",
    task: ["~/README.txt を ~/training/ の中へコピーせよ。(前提: 問1)"],
    hint: "cp ~/README.txt ~/training/",
    verify(ctx) {
      const src = ctx.vfs.stat(`${HOME}/README.txt`);
      const dst = ctx.vfs.stat(`${HOME}/training/README.txt`);
      if (!dst || dst.type !== "file") return "~/training/README.txt がありません。";
      if (src && dst.content !== src.content) return "中身が元の README.txt と違います。";
      if (!ctx.vfs.stat(`${HOME}/README.txt`)) return "元の README.txt が消えています (mv ではなく cp)。";
      return true;
    },
  },
  {
    id: 3, cat: "基礎", level: 1,
    title: "名前を変える",
    task: ["~/training/README.txt を ~/training/readme.md に改名せよ。(前提: 問2)"],
    hint: "mv ~/training/README.txt ~/training/readme.md",
    verify(ctx) {
      if (!ctx.vfs.stat(`${HOME}/training/readme.md`)) return "~/training/readme.md がありません。";
      if (ctx.vfs.stat(`${HOME}/training/README.txt`)) return "古い README.txt が残っています (cp ではなく mv)。";
      return true;
    },
  },
  {
    id: 4, cat: "基礎", level: 1,
    title: "まとめて touch",
    task: ["~/training/ に log1.txt log2.txt log3.txt の3つの空ファイルを作れ。(前提: 問1)", "1コマンドでまとめて作れると上級者。"],
    hint: "touch ~/training/log{1..3}.txt (ブレース展開) または touch log1.txt log2.txt log3.txt",
    verify(ctx) {
      for (const n of ["log1.txt", "log2.txt", "log3.txt"]) {
        if (!ctx.vfs.stat(`${HOME}/training/${n}`)) return `~/training/${n} がありません。`;
      }
      return true;
    },
  },
  {
    id: 5, cat: "基礎", level: 2,
    title: "シンボリックリンク",
    task: ["ホームディレクトリに、docs/guide.md を指すシンボリックリンク guide を作れ。"],
    hint: "ln -s docs/guide.md ~/guide",
    verify(ctx) {
      const n = ctx.vfs.lstat(`${HOME}/guide`);
      if (!n) return "~/guide がありません。";
      if (n.type !== "symlink") return "~/guide がシンボリックリンクではありません (ln に -s が必要)。";
      const t = ctx.vfs.stat(`${HOME}/guide`);
      if (!t || t.content !== ctx.vfs.stat(`${HOME}/docs/guide.md`)?.content) return "リンク先が docs/guide.md に解決されません。";
      return true;
    },
  },
  {
    id: 6, cat: "基礎", level: 1,
    title: "削除する",
    task: ["~/training/log2.txt だけを削除せよ。log1.txt と log3.txt は残すこと。(前提: 問4)"],
    hint: "rm ~/training/log2.txt",
    verify(ctx) {
      if (ctx.vfs.stat(`${HOME}/training/log2.txt`)) return "log2.txt がまだ存在します。";
      if (!ctx.vfs.stat(`${HOME}/training/log1.txt`) || !ctx.vfs.stat(`${HOME}/training/log3.txt`)) {
        return "log1.txt / log3.txt まで消えています。";
      }
      return true;
    },
  },

  // ===== テキスト・パイプ =====
  {
    id: 7, cat: "テキスト・パイプ", level: 1,
    title: "TODO を数える",
    task: ["~/todo.txt の中で「TODO」で始まる行は何行あるか?", "数えたら answer <数> で回答。"],
    hint: "grep -c '^TODO' todo.txt",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/todo.txt`).filter((l) => l.startsWith("TODO")).length),
  },
  {
    id: 8, cat: "テキスト・パイプ", level: 2,
    title: "数値の合計",
    task: ["~/data/numbers.txt の全数値の合計は? answer <数> で回答。"],
    hint: "awk '{s+=$1} END {print s}' data/numbers.txt",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/data/numbers.txt`).reduce((s, l) => s + (parseInt(l, 10) || 0), 0)),
  },
  {
    id: 9, cat: "テキスト・パイプ", level: 2,
    title: "最頻出の果物",
    task: ["~/data/fruits.txt で最も多く登場する果物の名前は? answer <名前> で回答。"],
    hint: "sort data/fruits.txt | uniq -c | sort -nr | head -1",
    answer: (ctx) => {
      const count = new Map<string, number>();
      for (const l of fileLines(ctx, `${HOME}/data/fruits.txt`)) count.set(l, (count.get(l) ?? 0) + 1);
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    },
  },
  {
    id: 10, cat: "テキスト・パイプ", level: 2,
    title: "認証失敗を数える",
    task: ["~/data/access.log でステータス 401 のリクエストは何件か? answer <数> で回答。"],
    hint: "grep -c ' 401 ' data/access.log (または awk '$9==401' data/access.log | wc -l)",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/data/access.log`).filter((l) => l.split(" ")[8] === "401").length),
  },
  {
    id: 11, cat: "テキスト・パイプ", level: 3,
    title: "アクセス数トップの IP",
    task: ["~/data/access.log で最もアクセス数が多い IP アドレスは? answer <IP> で回答。"],
    hint: "awk '{print $1}' data/access.log | sort | uniq -c | sort -nr | head -1",
    answer: (ctx) => {
      const count = new Map<string, number>();
      for (const l of fileLines(ctx, `${HOME}/data/access.log`)) {
        const ip = l.split(" ")[0];
        if (ip) count.set(ip, (count.get(ip) ?? 0) + 1);
      }
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    },
  },
  {
    id: 12, cat: "テキスト・パイプ", level: 1,
    title: "エラーの行数",
    task: ["~/logs/app.log に ERROR の行は何行あるか? answer <数> で回答。"],
    hint: "grep -c ERROR logs/app.log",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/logs/app.log`).filter((l) => l.includes("ERROR")).length),
  },
  {
    id: 13, cat: "テキスト・パイプ", level: 2,
    title: "/etc/passwd を読む",
    task: ["/etc/passwd で、ログインシェルが /bin/bash のユーザは何人か? answer <数> で回答。"],
    hint: "grep -c '/bin/bash$' /etc/passwd (passwd の最終フィールドがシェル)",
    answer: (ctx) => String(fileLines(ctx, "/etc/passwd").filter((l) => l.endsWith("/bin/bash")).length),
  },
  {
    id: 14, cat: "テキスト・パイプ", level: 3,
    title: "math の最高得点者",
    task: ["~/data/scores.csv で subject が math のうち、最高 score の name は? answer <名前> で回答。"],
    hint: "awk -F, '$2==\"math\"' data/scores.csv | sort -t, -k3 -nr | head -1",
    answer: (ctx) => {
      let best = "";
      let bestScore = -1;
      for (const l of fileLines(ctx, `${HOME}/data/scores.csv`).slice(1)) {
        const [name, subject, score] = l.split(",");
        if (subject === "math" && parseInt(score, 10) > bestScore) {
          bestScore = parseInt(score, 10);
          best = name;
        }
      }
      return best;
    },
  },

  // ===== 権限・システム =====
  {
    id: 15, cat: "権限・システム", level: 2,
    title: "権限を 700 に",
    task: ["~/projects/hello.sh のパーミッションを rwx------ (700) にせよ。check で判定。"],
    hint: "chmod 700 projects/hello.sh (または chmod u=rwx,go= ...)",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/projects/hello.sh`);
      if (!n) return "projects/hello.sh が見つかりません。";
      if ((n.mode & 0o777) !== 0o700) return `現在 ${(n.mode & 0o777).toString(8)} です。700 にしてください。`;
      return true;
    },
  },
  {
    id: 16, cat: "権限・システム", level: 1,
    title: "環境変数を設定",
    task: ["環境変数 DOJO に master という値を設定 (export) せよ。check で判定。"],
    hint: "export DOJO=master (echo $DOJO で確認できる)",
    verify(ctx) {
      const v = ctx.env.get("DOJO");
      if (v == null) return "DOJO が設定されていません。";
      if (v !== "master") return `DOJO=${v} になっています。master にしてください。`;
      return true;
    },
  },
  {
    id: 17, cat: "権限・システム", level: 2,
    title: "アーカイブを作る",
    task: ["~/data ディレクトリを ~/backup.tar.gz に圧縮アーカイブせよ。check で判定。"],
    hint: "cd ~ && tar czf backup.tar.gz data",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/backup.tar.gz`);
      if (!n || n.type !== "file") return "~/backup.tar.gz がありません。";
      if (n.content.length === 0) return "backup.tar.gz が空です。tar czf backup.tar.gz data のように作ってください。";
      return true;
    },
  },

  // ===== Git =====
  {
    id: 18, cat: "Git", level: 2,
    title: "ブランチを作って切替",
    task: ["~/projects で practice という名前のブランチを作成し、そのブランチへ切り替えよ。check で判定。"],
    hint: "cd ~/projects && git checkout -b practice (switch -c でも可)",
    verify(ctx) {
      const head = ctx.vfs.stat(`${HOME}/projects/.git/HEAD`);
      if (!head) return "~/projects がリポジトリではありません。";
      if (!head.content.includes("refs/heads/practice")) return `現在のブランチは ${/refs\/heads\/(.+)/.exec(head.content)?.[1]?.trim() ?? "?"} です。practice に切り替えてください。`;
      return true;
    },
  },
  {
    id: 19, cat: "Git", level: 3,
    title: "リポジトリを作って初コミット",
    task: ["~/training を git リポジトリにして (git init)、何かファイルを add し、最初のコミットをせよ。(前提: 問1)", "check で判定。"],
    hint: "cd ~/training && git init && git add . && git commit -m 'first'",
    verify(ctx) {
      const snap = repoSnapshot(ctx.vfs, `${HOME}/training`);
      if (!snap) return "~/training で git init がまだです。";
      if (snap.commits < 1) return "コミットがまだありません。git add . && git commit -m 'メッセージ'";
      return true;
    },
  },

  // ===== スクリプト =====
  {
    id: 20, cat: "スクリプト", level: 3,
    title: "実行できるスクリプト",
    task: [
      "~/bin ディレクトリに greet.sh を作成せよ。条件:",
      "  1. 中身に echo コマンドを含む",
      "  2. 実行権限が付いている (./greet.sh で実行できる)",
      "check で判定。",
    ],
    hint: "mkdir -p ~/bin && echo 'echo Hello' > ~/bin/greet.sh && chmod +x ~/bin/greet.sh (vim/emacs で書いても OK)",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/bin/greet.sh`);
      if (!n || n.type !== "file") return "~/bin/greet.sh がありません。";
      if (!n.content.includes("echo")) return "greet.sh に echo が含まれていません。";
      if ((n.mode & 0o100) === 0) return "実行権限がありません。chmod +x ~/bin/greet.sh";
      return true;
    },
  },
];

/** 帯ランク (クリア数 → 称号)。 */
export const BELTS: Array<[number, string, string]> = [
  // [必要クリア数, 帯, 色ANSI]
  [0, "白帯", "\x1b[38;2;230;234;245m"],
  [4, "黄帯", "\x1b[38;2;255;198;0m"],
  [8, "緑帯", "\x1b[38;2;126;214;126m"],
  [12, "青帯", "\x1b[38;2;120;170;255m"],
  [16, "茶帯", "\x1b[38;2;200;140;80m"],
  [20, "黒帯 (師範)", "\x1b[1m\x1b[38;2;240;244;255m"],
];

export function beltFor(cleared: number): [string, string] {
  let cur: [string, string] = [BELTS[0][1], BELTS[0][2]];
  for (const [need, name, color] of BELTS) {
    if (cleared >= need) cur = [name, color];
  }
  return cur;
}
