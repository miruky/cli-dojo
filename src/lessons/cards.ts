/**
 * カード式一問一答のデータ。
 * 全コマンドを対象に、主要コマンドは「問題文 + オプション」を厳選して用意し、
 * 残りは summary から自動生成する (取りこぼしゼロ)。
 */
import { REFERENCE } from "./reference";

export interface CommandCard {
  /** 正解のコマンド名。 */
  cmd: string;
  /** 必要なオプション/引数 (カードにヒントとして表示し、入力にも要求)。 */
  args?: string;
  /** 問題文。 */
  q: string;
  /** 別解 (これらの入力も正解)。 */
  accept?: string[];
  /** カテゴリ (フィルタ用)。 */
  cat: string;
}

/** 厳選カード: cmd → [問題文, args?, accept?] */
const CURATED: Array<[string, string, string?, string[]?]> = [
  // ===== 基礎 =====
  ["pwd", "現在いるディレクトリの絶対パスを表示してください"],
  ["ls", "隠しファイルも含めて、詳細形式で一覧表示してください", "-la", ["ls -al", "ls -l -a", "ls -a -l"]],
  ["cd", "ホームディレクトリに移動してください", undefined, ["cd ~"]],
  ["tree", "ディレクトリ階層をツリー表示してください"],
  ["mkdir", "存在しない親ディレクトリも含めて、まとめてディレクトリを作成したい。そのオプションは?", "-p"],
  ["touch", "空のファイルを作成してください (ファイル名: a.txt)", "a.txt"],
  ["cp", "ディレクトリを中身ごと再帰的にコピーしたい。そのオプションは?", "-r", ["cp -R", "cp -a"]],
  ["rm", "ディレクトリを中身ごと削除したい。そのオプションは?", "-r", ["rm -rf", "rm -R"]],
  ["ln", "シンボリックリンクを作成したい。そのオプションは?", "-s"],
  ["file", "ファイルの種類を推定してください (対象: a.txt)", "a.txt"],
  ["which", "コマンドの実行ファイルのパスを調べてください (対象: ls)", "ls"],
  ["du", "ディレクトリの合計サイズを人間が読みやすい形で表示してください", "-sh"],
  ["df", "ディスクの空き容量を人間が読みやすい単位で表示してください", "-h"],

  // ===== テキスト =====
  ["cat", "ファイルを行番号付きで表示したい。そのオプションは?", "-n"],
  ["head", "ファイルの先頭 5 行だけを表示したい", "-5", ["head -n 5", "head -n5"]],
  ["tail", "ログファイルの末尾を追いかけ続けたい (リアルタイム監視)。そのオプションは?", "-f"],
  ["wc", "ファイルの行数を数えたい。そのオプションは?", "-l"],
  ["sort", "数値として並べ替えたい。そのオプションは?", "-n"],
  ["uniq", "各行の出現回数を付けて表示したい。そのオプションは?", "-c"],
  ["tr", "小文字を大文字に変換してください", "a-z A-Z", ["tr 'a-z' 'A-Z'", "tr [:lower:] [:upper:]"]],
  ["nl", "行番号を付けて表示してください"],
  ["tee", "画面に表示しながらファイルにも保存したい (ファイル名: log.txt)", "log.txt"],
  ["diff", "2つのファイルの差分を unified 形式で見たい。そのオプションは?", "-u"],
  ["column", "表を桁揃えして見やすくしたい。そのオプションは?", "-t"],

  // ===== 検索 =====
  ["grep", "大文字小文字を区別せず、行番号付きで検索したい。そのオプションは?", "-in", ["grep -ni", "grep -i -n", "grep -n -i"]],
  ["find", "カレント以下から .log ファイルを探してください", ". -name '*.log'", ["find . -name \"*.log\""]],
  ["rg", "カレント以下から TODO を再帰検索してください (ripgrep)", "TODO"],
  ["fd", "名前に csv を含むファイルを探してください (fd)", "csv"],
  ["xargs", "前のコマンドの出力を引数にして wc -l を実行したい", "wc -l"],
  ["fzf", "ファイルを曖昧検索で選びたい (ファジーファインダ)"],

  // ===== sed / awk =====
  ["sed", "ファイル全体の old を new にすべて置換してください", "'s/old/new/g'", ["sed s/old/new/g"]],
  ["awk", "各行の 1 列目だけを表示してください", "'{print $1}'", ["awk {print $1}"]],

  // ===== 権限 =====
  ["chmod", "所有者だけ読み書き実行でき、他は読み+実行のみ (8進数 3 桁) にしてください", "755"],
  ["chown", "ファイルの所有者を guest に変更してください (対象: a.txt)", "guest a.txt"],
  ["umask", "新規ファイルのデフォルト権限マスクを確認してください"],
  ["id", "自分の UID / GID / 所属グループを表示してください"],

  // ===== プロセス・システム =====
  ["ps", "全ユーザの全プロセスを詳細表示してください (BSD 形式)", "aux", ["ps -ef"]],
  ["top", "プロセスをリアルタイムに監視してください (古典派)"],
  ["htop", "プロセスをリアルタイムに監視してください (モダン派)"],
  ["kill", "PID 1234 のプロセスに強制終了シグナルを送ってください", "-9 1234", ["kill -KILL 1234", "kill -SIGKILL 1234"]],
  ["pgrep", "nginx のプロセス ID を名前から調べてください", "nginx"],
  ["free", "メモリの使用状況を人間が読みやすい単位で表示してください", "-h"],
  ["uptime", "システムの稼働時間と負荷平均を表示してください"],
  ["uname", "カーネル情報をすべて表示したい。そのオプションは?", "-a"],
  ["watch", "1秒ごとに date を再実行して監視してください", "-n 1 date"],
  ["jobs", "バックグラウンドジョブの一覧を表示してください"],
  ["nice", "優先度を下げてコマンドを実行したい (このコマンド名は?)"],

  // ===== ネットワーク =====
  ["ip", "IP アドレスを確認してください (モダンな書き方)", "addr", ["ip a"]],
  ["ss", "リッスン中の TCP ポートを数値表示で確認してください", "-tln", ["ss -tlnp", "ss -ltn"]],
  ["ping", "web01 に疎通確認してください", "web01"],
  ["dig", "example.com の IP アドレスを DNS で引いてください", "example.com"],
  ["curl", "HTTP レスポンスのヘッダだけ取得したい。そのオプションは?", "-I"],
  ["ssh", "guest ユーザとして web01 にログインしてください", "guest@web01"],

  // ===== アーカイブ =====
  ["tar", "ディレクトリを gzip 圧縮アーカイブにするときの基本オプションは?", "czf", ["tar -czf", "tar czvf", "tar -czvf"]],
  ["gzip", "ファイルを gzip 圧縮してください (対象: big.log)", "big.log"],
  ["gunzip", "gzip ファイルを解凍してください (対象: big.log.gz)", "big.log.gz"],
  ["zip", "ディレクトリを再帰的に zip したい。そのオプションは?", "-r"],
  ["rsync", "属性を保持しつつ再帰コピーし、経過も表示したい。そのオプションは?", "-av", ["rsync -va"]],
  ["sha256sum", "ファイルの SHA-256 ハッシュを計算してください (対象: backup.tar.gz)", "backup.tar.gz"],

  // ===== シェル =====
  ["echo", "環境変数 HOME の値を表示してください", "$HOME"],
  ["export", "環境変数 EDITOR に vim を設定してください", "EDITOR=vim"],
  ["alias", "ll2 という名前で 'ls -la' の別名を作ってください", "ll2='ls -la'", ["alias ll2=\"ls -la\""]],
  ["history", "コマンド履歴を表示してください"],
  ["env", "環境変数の一覧を表示してください"],
  ["time", "コマンドの実行時間を計測したい (wc -l a.txt を計測)", "wc -l a.txt"],
  ["seq", "1 から 10 までの数列を出力してください", "1 10"],
  ["bc", "計算機にパイプで式を渡すときのコマンド名は?"],

  // ===== Git =====
  ["git", "作業ツリーの状態 (変更/未追跡) を確認してください", "status"],

  // ===== ページャ・ヘルプ =====
  ["less", "長いファイルをページ送りで読みたい (対象: /var/log/syslog)", "/var/log/syslog"],
  ["man", "ls のマニュアルページを開いてください", "ls"],
  ["tldr", "tar の要点だけの使い方を見たい", "tar"],
  ["whatis", "tar の一行説明だけ見たい", "tar"],
  ["apropos", "「network」に関係するコマンドを探してください", "network"],

  // ===== モダン =====
  ["eza", "アイコン付き・詳細形式で一覧表示してください (モダン ls)", "-l"],
  ["bat", "シンタックスハイライト付きでファイルを表示してください (対象: hello.sh)", "hello.sh"],
  ["jq", "JSON を整形して表示してください (フィルタは恒等)", "."],
  ["dust", "ディスク使用量をバー付きで見たい (モダン du)"],
  ["duf", "ファイルシステムの使用状況を罫線テーブルで見たい (モダン df)"],
  ["z", "部分一致で projects ディレクトリへジャンプしてください (zoxide)", "projects"],

  // ===== 道場 =====
  ["neofetch", "システム情報をロゴ付きで表示してください (ドヤ)"],
  ["cowsay", "牛に「hello」と言わせてください", "hello"],
  ["fortune", "ランダムな格言を表示してください"],
  ["cmatrix", "マトリックスの世界に入ってください"],
  ["challenge", "チャレンジ道場の問題一覧を開いてください"],
  ["quiz", "4択クイズを開始してください"],
  ["daily", "今日のデイリー修行を開始してください"],
  ["stats", "自分の修行統計を表示してください"],
  ["vimtutor", "vim のチュートリアルを開始してください"],
];

const CURATED_MAP = new Map(CURATED.map(([cmd, q, args, accept]) => [cmd, { q, args, accept }]));

/** 自動生成の問題文: summary を一問一答の形に整える。 */
function autoQuestion(summary: string): string {
  const s = summary.replace(/\s*\(.*?\)\s*$/, "");
  return `「${s}」— このコマンドは?`;
}

let deckCache: CommandCard[] | null = null;

/** 全コマンドのカードデッキ (カテゴリ付き)。 */
export function allCards(): CommandCard[] {
  if (deckCache) return deckCache;
  const out: CommandCard[] = [];
  const seen = new Set<string>();
  for (const group of REFERENCE) {
    if (!group.commands) continue;
    for (const item of group.items) {
      if (seen.has(item.cmd)) continue;
      seen.add(item.cmd);
      const curated = CURATED_MAP.get(item.cmd);
      if (curated) {
        out.push({ cmd: item.cmd, args: curated.args, q: curated.q, accept: curated.accept, cat: group.title });
      } else {
        out.push({ cmd: item.cmd, q: autoQuestion(item.desc), cat: group.title });
      }
    }
  }
  deckCache = out;
  return out;
}

/** カードの一意キー (習得記録用)。 */
export function cardKey(c: CommandCard): string {
  return c.args ? `${c.cmd} ${c.args}` : c.cmd;
}

/** 期待する入力 (正規化済み)。 */
export function expectedInput(c: CommandCard): string {
  return normalize(c.args ? `${c.cmd} ${c.args}` : c.cmd);
}

/** 入力の正規化: 空白圧縮 + 引用符をならす。 */
export function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/["']/g, "'");
}

/** 入力が正解か。 */
export function isCorrect(c: CommandCard, input: string): boolean {
  const n = normalize(input);
  if (n === "") return false;
  if (n === expectedInput(c)) return true;
  for (const a of c.accept ?? []) {
    if (n === normalize(a)) return true;
  }
  return false;
}

const KEY_MASTERED = "cli-dojo.cards.mastered";

export function loadMastered(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY_MASTERED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveMastered(s: Set<string>): void {
  try {
    localStorage.setItem(KEY_MASTERED, JSON.stringify([...s]));
  } catch {
    /* 保存不可でもプレイ可能 */
  }
}
