import type { Command, ExecContext } from "../types";

/**
 * ページャ/全画面アプリの起動コマンド群。
 * tty のときは services.launch でペインに全画面アプリをホストさせ、
 * パイプの途中など非 tty のときは cat 相当として振る舞う。
 */

const B = "\x1b[1m";
const R = "\x1b[0m";
const U = "\x1b[4m";

/** less/more 共通: 引数ファイル or 標準入力を取得。 */
function gatherText(ctx: ExecContext): { text: string; title: string } | null {
  const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
  if (files.length === 0) return { text: ctx.stdin, title: "(stdin)" };
  let text = "";
  for (const f of files) {
    const node = ctx.vfs.stat(ctx.resolve(f));
    if (!node || node.type !== "file") {
      ctx.err(`${ctx.args[0]}: ${f}: そのようなファイルはありません\n`);
      return null;
    }
    text += node.content;
  }
  return { text, title: files.join(" ") };
}

function pagerCommand(name: string, summary: string): Command {
  return {
    name,
    summary,
    run(ctx) {
      const got = gatherText(ctx);
      if (!got) return 1;
      if (!ctx.tty) {
        ctx.out(got.text);
        return 0;
      }
      ctx.services.launch("less", [], { text: got.text, title: got.title });
      return 0;
    },
  };
}

// ===== man =====

interface ManPage {
  name: string;
  section: string;
  oneline: string;
  synopsis: string;
  description: string[];
  options?: Array<[string, string]>;
  examples?: Array<[string, string]>;
}

const MAN_PAGES: ManPage[] = [
  {
    name: "ls", section: "1", oneline: "ディレクトリの内容を一覧表示する",
    synopsis: "ls [OPTION]... [FILE]...",
    description: ["FILE (デフォルトは現在のディレクトリ) の情報を一覧表示する。", "-cftuvSUX のいずれも指定が無ければアルファベット順に並べる。"],
    options: [
      ["-a, --all", ". で始まる隠しファイルも表示する"],
      ["-l", "長い形式 (権限・所有者・サイズ・更新時刻) で表示する"],
      ["-h, --human-readable", "サイズを 1K 234M 2G のように表示する (-l と併用)"],
      ["-t", "更新時刻が新しい順に並べる"],
      ["-S", "サイズが大きい順に並べる"],
      ["-r, --reverse", "並び順を逆にする"],
      ["-R, --recursive", "サブディレクトリを再帰的に表示する"],
      ["-F", "種類を示す記号 (*/=>@|) を付ける"],
      ["-d", "ディレクトリ自体を表示する (中身ではなく)"],
      ["-i", "inode 番号を表示する"],
    ],
    examples: [["ls -la", "隠しファイル込みで詳細表示"], ["ls -lhS", "サイズ順 (人間可読)"], ["ls -ltr", "古い順に詳細表示"]],
  },
  {
    name: "grep", section: "1", oneline: "パターンに一致する行を表示する",
    synopsis: "grep [OPTION]... PATTERN [FILE]...",
    description: ["各 FILE から PATTERN に一致する行を検索して表示する。", "PATTERN は既定で基本正規表現 (BRE)。-E で拡張正規表現 (ERE) になる。"],
    options: [
      ["-i, --ignore-case", "大文字小文字を区別しない"],
      ["-v, --invert-match", "一致しない行を表示する"],
      ["-n, --line-number", "行番号を付けて表示する"],
      ["-r, --recursive", "ディレクトリを再帰的に検索する"],
      ["-c, --count", "一致した行数だけを表示する"],
      ["-l, --files-with-matches", "一致を含むファイル名だけを表示する"],
      ["-w, --word-regexp", "単語全体に一致する行のみ"],
      ["-E, --extended-regexp", "拡張正規表現 (egrep 相当)"],
      ["-F, --fixed-strings", "正規表現でなく固定文字列として扱う"],
      ["-A NUM / -B NUM / -C NUM", "一致行の後 / 前 / 前後 NUM 行も表示する"],
      ["-o, --only-matching", "一致した部分だけを表示する"],
    ],
    examples: [
      ["grep -n ERROR logs/app.log", "行番号付きで ERROR を検索"],
      ["grep -ri todo .", "再帰的に大文字小文字無視で検索"],
      ["grep -E '^[0-9]+' file", "拡張正規表現で数字始まりの行"],
    ],
  },
  {
    name: "find", section: "1", oneline: "ディレクトリ階層からファイルを検索する",
    synopsis: "find [PATH...] [EXPRESSION]",
    description: ["各 PATH を根とするディレクトリ木を辿り、EXPRESSION を評価する。", "テストとアクションの組み合わせで柔軟に検索できる。"],
    options: [
      ["-name PATTERN", "ファイル名がグロブ PATTERN に一致 (引用符で囲む)"],
      ["-iname PATTERN", "-name の大文字小文字無視版"],
      ["-type f|d|l", "種類で絞る (ファイル/ディレクトリ/リンク)"],
      ["-size +N / -N / Nc", "サイズで絞る (c はバイト)"],
      ["-mtime +N / -N", "更新日数で絞る"],
      ["-maxdepth N", "探索する深さの上限"],
      ["-exec CMD {} \\;", "見つけた各ファイルに CMD を実行"],
      ["! / -o / -a", "否定 / OR / AND (既定は AND)"],
    ],
    examples: [
      ['find . -name "*.log"', "拡張子 .log を再帰検索"],
      ["find . -type f -size +200c", "200 バイト超のファイル"],
      ['find . -name "*.csv" -exec wc -l {} \\;', "各 CSV の行数を数える"],
    ],
  },
  {
    name: "sed", section: "1", oneline: "ストリームエディタ — テキストを変換する",
    synopsis: "sed [OPTION]... SCRIPT [FILE]...",
    description: ["入力を 1 行ずつ読み、SCRIPT (s/// など) を適用して出力する。", "アドレス (行番号や /regex/) でコマンドの適用範囲を絞れる。"],
    options: [
      ["-n", "自動出力を抑止する (p と併用)"],
      ["-e SCRIPT", "スクリプトを追加する"],
      ["-i", "ファイルを直接書き換える"],
      ["-E, -r", "拡張正規表現を使う"],
    ],
    examples: [
      ["sed 's/old/new/g' file", "すべての old を new に置換"],
      ["sed -n '2,4p' file", "2〜4 行目だけ表示"],
      ["sed '/^#/d' file", "コメント行を削除"],
      ["sed -E 's/([a-z]+)@/\\1 AT /' file", "後方参照付き置換"],
    ],
  },
  {
    name: "awk", section: "1", oneline: "パターン走査・処理言語",
    synopsis: "awk [-F FS] [-v VAR=VAL] 'PROGRAM' [FILE]...",
    description: ["入力をレコード (行) とフィールドに分割し、PROGRAM の パターン{アクション} を評価する。", "$1 が第1フィールド、NR が行番号、NF がフィールド数。"],
    options: [
      ["-F FS", "フィールド区切りを FS にする (例: -F,)"],
      ["-v VAR=VAL", "変数を事前に定義する"],
    ],
    examples: [
      ["awk '{print $1}' file", "第1カラムを表示"],
      ["awk -F, '$3>80 {print $1}' data.csv", "3列目が80超の行の1列目"],
      ["awk '{s+=$1} END {print s}' nums", "合計を計算"],
      ["awk 'NR%2==1' file", "奇数行だけ表示"],
    ],
  },
  {
    name: "tar", section: "1", oneline: "アーカイブの作成・展開",
    synopsis: "tar [OPTION...] [FILE]...",
    description: ["複数のファイルを 1 つのアーカイブにまとめる/取り出す。", "z (gzip) を付けると圧縮も同時に行う。"],
    options: [
      ["-c", "アーカイブを作成する"],
      ["-x", "アーカイブを展開する"],
      ["-t", "内容の一覧を表示する"],
      ["-f FILE", "アーカイブファイル名 (必須・直後にファイル名)"],
      ["-z", "gzip で圧縮/伸長する"],
      ["-v", "処理したファイル名を表示する"],
      ["-C DIR", "DIR に移動してから処理する"],
    ],
    examples: [
      ["tar czvf backup.tar.gz data/", "data/ を圧縮アーカイブに"],
      ["tar tzvf backup.tar.gz", "中身を確認"],
      ["tar xzvf backup.tar.gz -C tmp/", "tmp/ に展開"],
    ],
  },
  {
    name: "chmod", section: "1", oneline: "ファイルのモード (権限) を変更する",
    synopsis: "chmod [OPTION]... MODE[,MODE]... FILE...",
    description: ["MODE は 8 進数 (755 など) または記号 (u+x など)。", "r=4, w=2, x=1 の和で、所有者/グループ/その他の 3 桁。"],
    options: [
      ["-R", "再帰的に変更する"],
      ["u/g/o/a + - = rwx", "記号モード (例: u+x, go-w, a=r)"],
    ],
    examples: [
      ["chmod 755 script.sh", "rwxr-xr-x にする"],
      ["chmod u+x script.sh", "所有者に実行権を足す"],
      ["chmod -R go-w dir/", "グループ/他者の書込権を再帰削除"],
    ],
  },
  {
    name: "ps", section: "1", oneline: "実行中のプロセスのスナップショットを表示",
    synopsis: "ps [OPTIONS]",
    description: ["現在のプロセスの情報を表示する。BSD 形式 (aux) と UNIX 形式 (-ef) がよく使われる。"],
    options: [
      ["aux", "全ユーザの全プロセスを詳細表示 (BSD)"],
      ["-ef", "全プロセスをフル形式で表示 (UNIX)"],
    ],
    examples: [["ps aux | grep nginx", "nginx のプロセスを探す"], ["ps -ef", "親子関係 (PPID) を確認"]],
  },
  {
    name: "git", section: "1", oneline: "分散バージョン管理システム",
    synopsis: "git <command> [<args>]",
    description: ["スナップショット方式でファイルの履歴を管理する。", "作業ツリー → (git add) → インデックス → (git commit) → リポジトリ の三段構え。"],
    options: [
      ["init", "リポジトリを新規作成する"],
      ["status", "作業ツリーの状態を表示する"],
      ["add <path>", "変更をインデックスに登録する"],
      ["commit -m <msg>", "インデックスの内容をコミットする"],
      ["log [--oneline]", "コミット履歴を表示する"],
      ["diff [--staged]", "変更差分を表示する"],
      ["branch [name]", "ブランチ一覧/作成"],
      ["checkout [-b] <branch>", "ブランチを切り替える (-b で作成)"],
      ["switch [-c] <branch>", "checkout の新しい書き方"],
    ],
    examples: [
      ["git init", "リポジトリを作る"],
      ["git add . && git commit -m 'first'", "全部ステージしてコミット"],
      ["git log --oneline", "履歴を 1 行ずつ"],
    ],
  },
  {
    name: "jq", section: "1", oneline: "コマンドライン JSON プロセッサ",
    synopsis: "jq [OPTION]... FILTER [FILE]",
    description: ["JSON を読み、FILTER を適用して整形・抽出する。", "FILTER は . (恒等)、.foo (フィールド)、.[] (配列展開) などを | で繋ぐ。"],
    options: [
      [".", "整形して出力 (pretty-print)"],
      [".foo.bar", "ネストしたフィールドを取り出す"],
      [".[]", "配列の各要素を出力する"],
      [".[0]", "配列の先頭要素"],
      ["keys / length", "キー一覧 / 要素数"],
      ["-r", "文字列を引用符なしで出力する"],
    ],
    examples: [
      ["cat data/users.json | jq .", "整形表示"],
      ["jq '.[] | .name' data/users.json", "全要素の name を抽出"],
      ["jq '.[0].email' data/users.json", "先頭要素の email"],
    ],
  },
  {
    name: "tmux", section: "1", oneline: "端末多重化 (ターミナルマルチプレクサ)",
    synopsis: "tmux [command]",
    description: ["1 つの画面で複数のウィンドウ/ペインを扱う。", "操作はプレフィックスキー (既定 Ctrl-b) に続けて 1 キー。"],
    options: [
      ["Ctrl-b c / n / p", "新規ウィンドウ / 次 / 前"],
      ['Ctrl-b % / "', "縦分割 / 横分割"],
      ["Ctrl-b 矢印 / o", "ペイン移動 / 巡回"],
      ["Ctrl-b x / d", "ペインを閉じる / デタッチ"],
    ],
    examples: [["tmux", "セッション開始"], ["(Ctrl-b d)", "デタッチしてシェルへ戻る"]],
  },
  {
    name: "ssh", section: "1", oneline: "OpenSSH リモートログインクライアント",
    synopsis: "ssh [-p port] [user@]hostname [command]",
    description: ["リモートホストに暗号化された接続でログインし、コマンドを実行する。"],
    options: [
      ["-p PORT", "接続先ポート (既定 22)"],
      ["-i FILE", "秘密鍵ファイルを指定"],
      ["-L local:host:port", "ローカルポートフォワード"],
    ],
    examples: [["ssh guest@web01", "web01 にログイン (模擬)"], ["ssh web01 uptime", "リモートでコマンド実行"]],
  },
  {
    name: "curl", section: "1", oneline: "URL へデータを転送する",
    synopsis: "curl [options] <url>",
    description: ["HTTP(S) などで URL からデータを取得/送信する。この道場ではローカルの模擬サーバに応答する。"],
    options: [
      ["-s", "進捗を出さない (silent)"],
      ["-I", "ヘッダだけ取得 (HEAD)"],
      ["-o FILE", "出力をファイルに保存"],
      ["-X METHOD", "HTTP メソッドを指定"],
    ],
    examples: [["curl http://web01/index.html", "ページ取得 (模擬)"], ["curl -I http://web01", "ヘッダ確認"]],
  },
  {
    name: "systemctl", section: "1", oneline: "systemd のサービスを管理する",
    synopsis: "systemctl [COMMAND] [UNIT]",
    description: ["サービス (ユニット) の起動・停止・状態確認・自動起動設定を行う。"],
    options: [
      ["status UNIT", "状態を表示する"],
      ["start / stop / restart UNIT", "起動 / 停止 / 再起動"],
      ["enable / disable UNIT", "自動起動を ON / OFF"],
      ["list-units --type=service", "サービス一覧"],
    ],
    examples: [["systemctl status nginx", "nginx の状態"], ["systemctl restart sshd", "sshd を再起動"]],
  },
  {
    name: "rg", section: "1", oneline: "ripgrep — 高速な再帰 grep",
    synopsis: "rg [OPTIONS] PATTERN [PATH...]",
    description: ["ディレクトリを再帰的に検索する近代的 grep。.gitignore を尊重し、結果をファイルごとに色付きで表示する。"],
    options: [
      ["-i", "大文字小文字を無視"],
      ["-n", "行番号 (既定で ON)"],
      ["-l", "一致したファイル名のみ"],
      ["-c", "ファイルごとの一致行数"],
      ["-t TYPE", "ファイルタイプで絞る (例: -t js)"],
    ],
    examples: [["rg TODO", "カレント以下から TODO を検索"], ["rg -i error logs/", "logs/ から error を検索"]],
  },
  {
    name: "rsync", section: "1", oneline: "高速・多機能なファイル同期ツール",
    synopsis: "rsync [OPTION]... SRC [DEST]",
    description: [
      "差分だけを転送してファイル/ディレクトリを同期する。バックアップの定番。",
      "SRC の末尾スラッシュに注意: data/ は「中身」を、data は「ディレクトリごと」コピーする。",
    ],
    options: [
      ["-a", "アーカイブモード (再帰 + 属性保持)"],
      ["-v", "転送したファイルを表示"],
      ["-n, --dry-run", "実際には転送せず動作を確認 (実機で重要)"],
      ["--delete", "転送元に無いファイルを転送先から削除 (実機では要注意)"],
    ],
    examples: [
      ["rsync -av data/ /tmp/mirror/", "data の中身をミラー"],
      ["rsync -av data/ /tmp/mirror/", "2回目は差分なし → 何も送らない"],
    ],
  },
  {
    name: "fzf", section: "1", oneline: "コマンドラインのファジーファインダ",
    synopsis: "command | fzf / fzf",
    description: ["候補リストをインタラクティブに曖昧検索して 1 件選ぶ。", "入力が無ければカレントディレクトリ以下のファイルが候補になる。"],
    options: [
      ["(入力)", "タイプするほど絞り込まれる"],
      ["↑↓ / Ctrl-j Ctrl-k", "候補の移動"],
      ["Enter / Esc", "確定 / キャンセル"],
    ],
    examples: [["fzf", "ファイルを曖昧検索"], ["ls | fzf", "ls の結果から選ぶ"], ["history | fzf", "履歴から選ぶ"]],
  },
];

function autoPage(name: string, summary: string): string {
  return [
    `${B}NAME${R}`,
    `       ${name} - ${summary}`,
    "",
    `${B}SYNOPSIS${R}`,
    `       ${B}${name}${R} [${U}OPTION${R}]... [${U}ARG${R}]...`,
    "",
    `${B}DESCRIPTION${R}`,
    `       ${summary}。`,
    "       この道場の実装では主要なオプションをサポートしています。",
    "       実際に打って試してみてください。",
    "",
    `${B}SEE ALSO${R}`,
    "       help (コマンド一覧), チートシート (右上のボタン)",
  ].join("\n");
}

function renderPage(p: ManPage): string {
  const out: string[] = [];
  const head = `${p.name.toUpperCase()}(${p.section})`;
  out.push(`${head}${" ".repeat(Math.max(1, 60 - head.length * 2))}User Commands${" ".repeat(Math.max(1, 60 - head.length * 2))}${head}`);
  out.push("");
  out.push(`${B}NAME${R}`);
  out.push(`       ${p.name} - ${p.oneline}`);
  out.push("");
  out.push(`${B}SYNOPSIS${R}`);
  out.push(`       ${p.synopsis}`);
  out.push("");
  out.push(`${B}DESCRIPTION${R}`);
  for (const d of p.description) out.push(`       ${d}`);
  if (p.options?.length) {
    out.push("");
    out.push(`${B}OPTIONS${R}`);
    for (const [opt, desc] of p.options) {
      out.push(`       ${B}${opt}${R}`);
      out.push(`              ${desc}`);
    }
  }
  if (p.examples?.length) {
    out.push("");
    out.push(`${B}EXAMPLES${R}`);
    for (const [cmd, desc] of p.examples) {
      out.push(`       ${U}${cmd}${R}`);
      out.push(`              ${desc}`);
    }
  }
  out.push("");
  return out.join("\n");
}

const man: Command = {
  name: "man",
  summary: "コマンドのマニュアルページを表示",
  run(ctx) {
    const args = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    if (ctx.args.includes("-k")) {
      // apropos 相当
      const kw = args[args.length - 1]?.toLowerCase() ?? "";
      for (const c of ctx.services.listCommands()) {
        if (c.name.includes(kw) || c.summary.toLowerCase().includes(kw)) {
          ctx.out(`${c.name} (1)            - ${c.summary}\n`);
        }
      }
      return 0;
    }
    const topic = args[0];
    if (!topic) {
      ctx.err("どのマニュアルページをお望みですか?\nman ls / man grep のように使います。\n");
      return 1;
    }
    const page = MAN_PAGES.find((p) => p.name === topic);
    let text: string;
    if (page) {
      text = renderPage(page);
    } else {
      const cmd = ctx.services.listCommands().find((c) => c.name === topic);
      if (!cmd) {
        ctx.err(`man: ${topic} のマニュアルページはありません\n`);
        return 16;
      }
      text = autoPage(cmd.name, cmd.summary);
    }
    if (!ctx.tty) {
      ctx.out(text + "\n");
      return 0;
    }
    ctx.services.launch("less", [], { text, title: `Manual page ${topic}(1)` });
    return 0;
  },
};

const htop: Command = {
  name: "htop",
  summary: "対話的プロセスビューア (リアルタイム更新)",
  run(ctx) {
    if (!ctx.tty) {
      ctx.err("htop: 端末でないと起動できません\n");
      return 1;
    }
    ctx.services.launch("htop", ctx.args.slice(1));
    return 0;
  },
};

const cmatrix: Command = {
  name: "cmatrix",
  summary: "マトリックス風デジタルレイン (q で終了)",
  run(ctx) {
    if (!ctx.tty) {
      ctx.err("cmatrix: 端末でないと起動できません\n");
      return 1;
    }
    ctx.services.launch("cmatrix", ctx.args.slice(1));
    return 0;
  },
};

const sl: Command = {
  name: "sl",
  summary: "ls のタイプミスで蒸気機関車が走る",
  run(ctx) {
    if (!ctx.tty) {
      ctx.out("sl: Steam Locomotive (端末で実行してください)\n");
      return 0;
    }
    ctx.services.launch("sl", ctx.args.slice(1));
    return 0;
  },
};

const fzf: Command = {
  name: "fzf",
  summary: "ファジーファインダ (曖昧検索で1件選ぶ)",
  run(ctx) {
    if (!ctx.tty) {
      // 非対話: 先頭行を返す (fzf --filter 的な動き)
      const first = ctx.stdin.split("\n").find((l) => l.trim() !== "");
      if (first) ctx.out(first + "\n");
      return 0;
    }
    let items: string[];
    if (ctx.stdin !== "") {
      items = ctx.stdin.split("\n").filter((l) => l.trim() !== "");
    } else {
      // 入力が無ければカレント以下のファイル一覧 (find . -type f 相当)
      items = [];
      const walk = (abs: string, rel: string, depth: number): void => {
        if (depth > 12 || items.length > 5000) return;
        const node = ctx.vfs.stat(abs);
        if (!node || !node.children) return;
        const names = [...node.children.keys()].sort();
        for (const name of names) {
          if (name === ".git") continue;
          const child = node.children.get(name)!;
          const r = rel ? `${rel}/${name}` : name;
          if (child.type === "dir") walk(`${abs === "/" ? "" : abs}/${name}`, r, depth + 1);
          else items.push(r);
        }
      };
      walk(ctx.env.cwd, "", 0);
    }
    ctx.services.launch("fzf", [], { items });
    return 0;
  },
};

const watch: Command = {
  name: "watch",
  summary: "コマンドを定期実行して全画面表示 (-n 秒)",
  run(ctx) {
    const args = ctx.args.slice(1);
    let interval = 2;
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) {
      if (args[i] === "-n" && i + 1 < args.length) {
        interval = parseFloat(args[i + 1]) || 2;
        i += 2;
      } else if (args[i].startsWith("-n")) {
        interval = parseFloat(args[i].slice(2)) || 2;
        i++;
      } else {
        i++;
      }
    }
    const line = args.slice(i).join(" ");
    if (!line) {
      ctx.err("watch: コマンドを指定してください (例: watch -n 1 date)\n");
      return 1;
    }
    if (!ctx.tty) {
      ctx.err("watch: 端末でないと起動できません\n");
      return 1;
    }
    ctx.services.launch("watch", [], { line, interval });
    return 0;
  },
};

export const pagerCommands: Command[] = [
  pagerCommand("less", "ページャ (q:終了 /:検索 Space/b:ページ送り)"),
  pagerCommand("more", "シンプルなページャ (less と同等)"),
  man,
  htop,
  cmatrix,
  sl,
  fzf,
  watch,
];
