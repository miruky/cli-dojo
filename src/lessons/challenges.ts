import type { ExecContext } from "../core/shell/types";
import type { VNode } from "../core/vfs/VFS";
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

/** root 以下のファイルを条件付きで数える (find 系チャレンジの期待値計算)。 */
function countFiles(
  ctx: ExecContext,
  root: string,
  pred: (name: string, node: VNode) => boolean,
): number {
  let count = 0;
  const walk = (abs: string, depth: number): void => {
    const node = ctx.vfs.stat(abs);
    if (!node || !node.children || depth > 12) return;
    for (const [name, child] of node.children) {
      const p = (abs === "/" ? "" : abs) + "/" + name;
      if (child.type === "file" && pred(name, child)) count++;
      if (child.type === "dir") walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return count;
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

  // ===== エディタ (vim/emacs/sed どれで解いても OK) =====
  {
    id: 21, cat: "エディタ", level: 2,
    title: "一括置換",
    task: ["~/notes.md の「TODO」をすべて「DONE」に置き換えよ。", "vim の :%s/TODO/DONE/g でも、sed -i でも OK。check で判定。"],
    hint: "vim notes.md → :%s/TODO/DONE/g → :wq  (または sed -i 's/TODO/DONE/g' notes.md)",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/notes.md`);
      if (!n) return "~/notes.md がありません。";
      if (n.content.includes("TODO")) return "まだ TODO が残っています。";
      if (!n.content.includes("DONE")) return "DONE が見当たりません。置換できていますか?";
      return true;
    },
  },
  {
    id: 22, cat: "エディタ", level: 2,
    title: "エディタでファイルを書く",
    task: ["~/training/memo.txt を作成し、1行目を「hello vim」にせよ。(前提: 問1)", "vim / emacs / echo どれでも OK。check で判定。"],
    hint: "vim ~/training/memo.txt → i で挿入 → hello vim → Esc → :wq",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/training/memo.txt`);
      if (!n || n.type !== "file") return "~/training/memo.txt がありません。";
      const first = n.content.split("\n")[0];
      if (first.trim() !== "hello vim") return `1行目が「${first}」です。「hello vim」にしてください。`;
      return true;
    },
  },
  {
    id: 23, cat: "エディタ", level: 3,
    title: "条件に合う行を消す",
    task: ["~/todo.txt から「DONE」で始まる行をすべて削除せよ。TODO の行は残すこと。", "vim の dd でも :g/^DONE/d でも sed -i '/^DONE/d' でも OK。check で判定。"],
    hint: "sed -i '/^DONE/d' todo.txt  (vim なら :g/^DONE/d)",
    verify(ctx) {
      const lines = fileLines(ctx, `${HOME}/todo.txt`);
      if (lines.some((l) => l.startsWith("DONE"))) return "まだ DONE の行が残っています。";
      if (!lines.some((l) => l.startsWith("TODO"))) return "TODO の行まで消えています。やりすぎです!";
      return true;
    },
  },
  {
    id: 24, cat: "エディタ", level: 1,
    title: "末尾に追記",
    task: ["~/todo.txt の末尾に「TODO learn vim」という行を追加せよ。", ">> リダイレクトでも vim の G→o でも OK。check で判定。"],
    hint: "echo 'TODO learn vim' >> todo.txt",
    verify(ctx) {
      const lines = fileLines(ctx, `${HOME}/todo.txt`);
      if (lines[lines.length - 1]?.trim() !== "TODO learn vim") return "最後の行が「TODO learn vim」になっていません。";
      return true;
    },
  },

  // ===== 正規表現 =====
  {
    id: 25, cat: "正規表現", level: 2,
    title: "IP らしき文字列を数える",
    task: ["~/data/words.txt に「数字.数字.数字.数字」形式の文字列はいくつあるか?", "(値の範囲チェックは不要) answer <数> で回答。"],
    hint: "grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+' data/words.txt | wc -l",
    answer: (ctx) => {
      const m = (ctx.vfs.stat(`${HOME}/data/words.txt`)?.content ?? "").match(/\d+\.\d+\.\d+\.\d+/g);
      return String(m?.length ?? 0);
    },
  },
  {
    id: 26, cat: "正規表現", level: 2,
    title: "電話番号を抽出",
    task: ["~/notes.md に書かれている XXX-XXXX-XXXX 形式の電話番号は? answer <番号> で回答。"],
    hint: "grep -oE '[0-9]{3}-[0-9]{4}-[0-9]{4}' notes.md",
    answer: (ctx) => /\d{3}-\d{4}-\d{4}/.exec(ctx.vfs.stat(`${HOME}/notes.md`)?.content ?? "")?.[0] ?? "",
  },
  {
    id: 27, cat: "正規表現", level: 3,
    title: "メールアドレスの数",
    task: ["~/notes.md に含まれるメールアドレスはいくつ? answer <数> で回答。"],
    hint: "grep -oE '[a-zA-Z0-9._]+@[a-zA-Z0-9.]+' notes.md | wc -l",
    answer: (ctx) => {
      const m = (ctx.vfs.stat(`${HOME}/notes.md`)?.content ?? "").match(/[a-zA-Z0-9._]+@[a-zA-Z0-9.-]+\.[a-z]+/g);
      return String(m?.length ?? 0);
    },
  },
  {
    id: 28, cat: "正規表現", level: 2,
    title: "POST リクエストを数える",
    task: ["~/data/access.log の POST リクエストは何件か? answer <数> で回答。"],
    hint: "grep -c '\"POST ' data/access.log",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/data/access.log`).filter((l) => l.includes('"POST ')).length),
  },

  // ===== 検索 (find) =====
  {
    id: 29, cat: "検索", level: 2,
    title: "CSV を探せ",
    task: ["ホームディレクトリ以下に .csv ファイルはいくつあるか? answer <数> で回答。"],
    hint: "find ~ -name '*.csv' | wc -l",
    answer: (ctx) => String(countFiles(ctx, HOME, (name) => name.endsWith(".csv"))),
  },
  {
    id: 30, cat: "検索", level: 2,
    title: "/etc の conf 系ファイル",
    task: ["/etc 以下で、名前に「conf」を含むファイルはいくつあるか? answer <数> で回答。"],
    hint: "find /etc -type f -name '*conf*' | wc -l",
    answer: (ctx) => String(countFiles(ctx, "/etc", (name) => name.includes("conf"))),
  },
  {
    id: 31, cat: "検索", level: 3,
    title: "大きいファイルを探せ",
    task: ["ホームディレクトリ以下で 1000 バイトを超えるファイルはいくつあるか? answer <数> で回答。"],
    hint: "find ~ -type f -size +1000c | wc -l",
    answer: (ctx) => String(countFiles(ctx, HOME, (_n, node) => node.content.length > 1000)),
  },

  // ===== JSON =====
  {
    id: 32, cat: "JSON", level: 2,
    title: "配列の要素数",
    task: ["~/data/users.json の配列には何人分のデータがあるか? answer <数> で回答。"],
    hint: "jq length data/users.json (または cat data/users.json | jq length)",
    answer: (ctx) => {
      try {
        const arr = JSON.parse(ctx.vfs.stat(`${HOME}/data/users.json`)?.content ?? "[]") as unknown[];
        return String(arr.length);
      } catch {
        return "";
      }
    },
  },
  {
    id: 33, cat: "JSON", level: 3,
    title: "30歳以上は何人?",
    task: ["~/data/users.json で age が 30 以上の人数は? answer <数> で回答。"],
    hint: "jq '.[] | .age' data/users.json で全員の age を見て数える",
    answer: (ctx) => {
      try {
        const arr = JSON.parse(ctx.vfs.stat(`${HOME}/data/users.json`)?.content ?? "[]") as Array<{ age: number }>;
        return String(arr.filter((u) => u.age >= 30).length);
      } catch {
        return "";
      }
    },
  },

  // ===== awk 上級 =====
  {
    id: 34, cat: "awk 上級", level: 3,
    title: "転送量の合計",
    task: ["~/data/access.log の最終列 (転送バイト数) の合計は? answer <数> で回答。"],
    hint: "awk '{s+=$10} END {print s}' data/access.log",
    answer: (ctx) =>
      String(fileLines(ctx, `${HOME}/data/access.log`).reduce((s, l) => {
        const parts = l.split(" ");
        return s + (parseInt(parts[parts.length - 1], 10) || 0);
      }, 0)),
  },
  {
    id: 35, cat: "awk 上級", level: 3,
    title: "english の合計点",
    task: ["~/data/scores.csv で subject が english の score 合計は? answer <数> で回答。"],
    hint: "awk -F, '$2==\"english\" {s+=$3} END {print s}' data/scores.csv",
    answer: (ctx) =>
      String(fileLines(ctx, `${HOME}/data/scores.csv`).slice(1).reduce((s, l) => {
        const [, subject, score] = l.split(",");
        return subject === "english" ? s + (parseInt(score, 10) || 0) : s;
      }, 0)),
  },
  {
    id: 36, cat: "awk 上級", level: 2,
    title: "WARN の行数",
    task: ["~/logs/app.log の WARN は何行か? answer <数> で回答。"],
    hint: "grep -c WARN logs/app.log (awk '/WARN/{c++} END{print c}' でも)",
    answer: (ctx) => String(fileLines(ctx, `${HOME}/logs/app.log`).filter((l) => l.includes("WARN")).length),
  },

  // ===== スクリプト・複合 =====
  {
    id: 37, cat: "スクリプト", level: 3,
    title: "引数を使うスクリプト",
    task: [
      "~/bin/count.sh を作成せよ。条件:",
      "  1. 第1引数 ($1) のファイルの行数を表示する (wc -l を使う)",
      "  2. 実行権限が付いている",
      "check で判定。",
    ],
    hint: "echo 'wc -l \"$1\"' > ~/bin/count.sh && chmod +x ~/bin/count.sh → ./bin/count.sh todo.txt で試す",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/bin/count.sh`);
      if (!n || n.type !== "file") return "~/bin/count.sh がありません。";
      if (!n.content.includes("$1")) return "count.sh が引数 $1 を使っていません。";
      if (!n.content.includes("wc")) return "count.sh に wc がありません。";
      if ((n.mode & 0o100) === 0) return "実行権限がありません。chmod +x ~/bin/count.sh";
      return true;
    },
  },
  {
    id: 38, cat: "スクリプト", level: 2,
    title: "エイリアスを作る",
    task: ["ll2 という名前で「ls -la」のエイリアスを作成せよ。check で判定。"],
    hint: "alias ll2='ls -la' (alias だけ打つと一覧が見える)",
    verify(ctx) {
      const a = ctx.services.aliases().get("ll2");
      if (!a) return "ll2 というエイリアスがありません。";
      if (!a.includes("ls") || !a.includes("-la")) return `ll2='${a}' になっています。'ls -la' にしてください。`;
      return true;
    },
  },
  {
    id: 39, cat: "スクリプト", level: 2,
    title: "深い階層を一発で",
    task: ["~/training/a/b/c という3階層のディレクトリを 1 コマンドで作成せよ。check で判定。"],
    hint: "mkdir -p ~/training/a/b/c (-p が親ごと作るオプション)",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/training/a/b/c`);
      if (!n || n.type !== "dir") return "~/training/a/b/c がまだありません。";
      return true;
    },
  },
  {
    id: 40, cat: "スクリプト", level: 3,
    title: "抽出して保存 (卒業試験)",
    task: [
      "~/data/access.log からステータス 401 の行だけを抜き出して、",
      "~/report.txt に保存せよ。check で判定。",
    ],
    hint: "grep ' 401 ' data/access.log > ~/report.txt",
    verify(ctx) {
      const n = ctx.vfs.stat(`${HOME}/report.txt`);
      if (!n || n.type !== "file") return "~/report.txt がありません。";
      const lines = fileLines(ctx, `${HOME}/report.txt`);
      const expected = fileLines(ctx, `${HOME}/data/access.log`).filter((l) => l.split(" ")[8] === "401");
      if (lines.length === 0) return "report.txt が空です。";
      if (!lines.every((l) => l.includes(" 401 "))) return "401 以外の行が混ざっています。";
      if (lines.length !== expected.length) return `401 の行は ${expected.length} 行あります (現在 ${lines.length} 行)。`;
      return true;
    },
  },
];

/** 帯ランク (クリア数 → 称号)。 */
export const BELTS: Array<[number, string, string]> = [
  // [必要クリア数, 帯, 色ANSI]
  [0, "白帯", "\x1b[38;2;230;234;245m"],
  [8, "黄帯", "\x1b[38;2;255;198;0m"],
  [16, "緑帯", "\x1b[38;2;126;214;126m"],
  [24, "青帯", "\x1b[38;2;120;170;255m"],
  [32, "茶帯", "\x1b[38;2;200;140;80m"],
  [40, "黒帯 (師範)", "\x1b[1m\x1b[38;2;240;244;255m"],
];

export function beltFor(cleared: number): [string, string] {
  let cur: [string, string] = [BELTS[0][1], BELTS[0][2]];
  for (const [need, name, color] of BELTS) {
    if (cleared >= need) cur = [name, color];
  }
  return cur;
}
