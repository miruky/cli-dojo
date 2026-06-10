/** LPIC 風 4 択クイズの問題プール。quiz コマンドでランダム 10 問出題。 */

export interface QuizQuestion {
  cat: string;
  q: string;
  /** 選択肢 (正解は answer のインデックス)。 */
  options: string[];
  answer: number;
  /** 正誤にかかわらず表示する解説。 */
  why: string;
}

const KEY_WRONG = "cli-dojo.quiz.wrong";
const KEY_DAILY_LAST = "cli-dojo.daily.last";
const KEY_DAILY_STREAK = "cli-dojo.daily.streak";

/** 間違えた問題 (問題文をキーに記録)。正解すると消える。 */
export function loadWrong(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY_WRONG) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function saveWrong(s: Set<string>): void {
  try {
    localStorage.setItem(KEY_WRONG, JSON.stringify([...s]));
  } catch {
    /* 保存不可でも動作は継続 */
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadStreak(): { streak: number; last: string; doneToday: boolean } {
  try {
    const last = localStorage.getItem(KEY_DAILY_LAST) ?? "";
    const streak = parseInt(localStorage.getItem(KEY_DAILY_STREAK) ?? "0", 10) || 0;
    return { streak, last, doneToday: last === todayStr() };
  } catch {
    return { streak: 0, last: "", doneToday: false };
  }
}

/** デイリー完走を記録し、新しいストリークを返す。 */
export function recordDailyDone(): number {
  const { streak, last, doneToday } = loadStreak();
  if (doneToday) return streak;
  const y = new Date(Date.now() - 86400_000);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  const next = last === yesterday ? streak + 1 : 1;
  try {
    localStorage.setItem(KEY_DAILY_LAST, todayStr());
    localStorage.setItem(KEY_DAILY_STREAK, String(next));
  } catch {
    /* 保存不可 */
  }
  return next;
}

function shuffled<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 日付シードの乱数 (デイリー出題が全員・終日同じになる)。 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type QuizMode = "normal" | "review" | "daily";

/** モードに応じて出題セットを組み立てる。 */
export function selectQuiz(mode: QuizMode, count: number): { questions: QuizQuestion[]; title: string } {
  if (mode === "review") {
    const wrong = loadWrong();
    const qs = shuffled(QUIZ_POOL.filter((q) => wrong.has(q.q)));
    return { questions: qs, title: "復習モード (間違えた問題)" };
  }
  if (mode === "daily") {
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const qs = shuffled(QUIZ_POOL, mulberry32(seed)).slice(0, 5);
    return { questions: qs, title: `デイリー修行 ${todayStr()}` };
  }
  return { questions: shuffled(QUIZ_POOL).slice(0, Math.max(1, Math.min(count, QUIZ_POOL.length))), title: "Linux クイズ" };
}

export const QUIZ_POOL: QuizQuestion[] = [
  // ===== 基礎 =====
  {
    cat: "基礎",
    q: "カレントディレクトリの絶対パスを表示するコマンドは?",
    options: ["cwd", "pwd", "path", "where"],
    answer: 1,
    why: "pwd = print working directory。cd - で直前のディレクトリに戻れるのもセットで覚えたい。",
  },
  {
    cat: "基礎",
    q: "「cp -r dir1 dir2」の -r の意味は?",
    options: ["読み取り専用でコピー", "ディレクトリを再帰的にコピー", "上書き確認をする", "シンボリックリンクを実体化する"],
    answer: 1,
    why: "-r (recursive) はディレクトリの中身ごと再帰コピー。ディレクトリのコピーには必須。",
  },
  {
    cat: "基礎",
    q: "隠しファイル (.bashrc など) も含めて一覧表示するのは?",
    options: ["ls -h", "ls -a", "ls -d", "ls -x"],
    answer: 1,
    why: "-a (all) は . で始まるファイルも表示する。-h は human-readable (サイズ表記) の意味。",
  },
  {
    cat: "基礎",
    q: "ファイルの種類 (テキスト/実行ファイル等) を推定するコマンドは?",
    options: ["type", "stat", "file", "what"],
    answer: 2,
    why: "file はマジックナンバー等から種類を推定する。type はコマンドの種別 (alias/builtin) を見るもの。",
  },
  {
    cat: "基礎",
    q: "「mkdir -p a/b/c」の -p の効果は?",
    options: ["権限を保持する", "途中の親ディレクトリもまとめて作る", "作成後に移動する", "上書きを許可する"],
    answer: 1,
    why: "-p (parents) は存在しない親も作る。既に存在してもエラーにならないので冪等。",
  },
  {
    cat: "基礎",
    q: "シンボリックリンクを作るコマンドは?",
    options: ["ln -s 実体 リンク名", "ln -s リンク名 実体", "link -s 実体 リンク名", "symlink リンク名"],
    answer: 0,
    why: "ln -s <target> <linkname> の順。cp と同じ「元 → 先」の順と覚える。",
  },

  // ===== テキスト処理 =====
  {
    cat: "テキスト処理",
    q: "ファイルの先頭 5 行だけを表示するのは?",
    options: ["top -5 file", "head -5 file", "first 5 file", "cat -5 file"],
    answer: 1,
    why: "head -n 5 (短縮形 -5)。末尾は tail -5。tail -f はログ監視の定番。",
  },
  {
    cat: "テキスト処理",
    q: "grep で「一致しない行」を表示するオプションは?",
    options: ["-i", "-n", "-v", "-c"],
    answer: 2,
    why: "-v (invert)。-i は大小無視、-n は行番号、-c は件数。4つセットで頻出。",
  },
  {
    cat: "テキスト処理",
    q: "「sort | uniq -c」の uniq -c は何をする?",
    options: ["重複行を消すだけ", "各行の出現回数を付けて表示", "大文字小文字を無視", "列を数える"],
    answer: 1,
    why: "-c (count) で「回数 行」の形式に。先に sort しないと隣接行しかまとめられない点が重要。",
  },
  {
    cat: "テキスト処理",
    q: "sed 's/a/b/' と sed 's/a/b/g' の違いは?",
    options: ["違いはない", "g は各行の最初の1個だけ置換", "g は各行のすべてを置換", "g はグローバル変数を使う"],
    answer: 2,
    why: "g (global) が無いと各行の最初の 1 箇所だけ。全部置き換えるなら s///g。",
  },
  {
    cat: "テキスト処理",
    q: "awk で 3 列目を表示するには?",
    options: ["awk '{print 3}'", "awk '{print $3}'", "awk '{print %3}'", "awk -c3"],
    answer: 1,
    why: "$3 が第3フィールド。$0 は行全体、NF は列数、NR は行番号。",
  },
  {
    cat: "テキスト処理",
    q: "CSV (カンマ区切り) を awk で処理するときの区切り指定は?",
    options: ["awk -d,", "awk -F,", "awk -t,", "awk --csv"],
    answer: 1,
    why: "-F でフィールドセパレータを指定 (cut は -d)。混同しやすいので注意。",
  },
  {
    cat: "テキスト処理",
    q: "2つのソート済みファイルの共通行を出すコマンドは?",
    options: ["diff a b", "comm -12 a b", "join -v a b", "uniq a b"],
    answer: 1,
    why: "comm は 3 列 (a のみ / b のみ / 共通) を出し、-12 で 1,2 列目を抑止 = 共通だけ表示。",
  },

  // ===== 権限 =====
  {
    cat: "権限",
    q: "chmod 754 file の「5」はどの権限?",
    options: ["rwx", "r-x", "r--", "-wx"],
    answer: 1,
    why: "5 = 4(r) + 1(x) = r-x。754 = rwxr-xr--。8進数は r=4, w=2, x=1 の和。",
  },
  {
    cat: "権限",
    q: "所有者だけ読み書きでき、他は一切アクセス不可にするのは?",
    options: ["chmod 600", "chmod 644", "chmod 700", "chmod 666"],
    answer: 0,
    why: "600 = rw-------。秘密鍵 (~/.ssh/id_rsa) はこれ。700 は実行権も付く (ディレクトリ向け)。",
  },
  {
    cat: "権限",
    q: "umask 022 のとき、新規ファイルのデフォルト権限は?",
    options: ["777", "755", "644", "622"],
    answer: 2,
    why: "ファイルの基準は 666 (x なし)。666 - 022 = 644。ディレクトリは 777 - 022 = 755。",
  },
  {
    cat: "権限",
    q: "ファイルの所有者を変更するコマンドは?",
    options: ["chmod", "chown", "chgrp", "usermod"],
    answer: 1,
    why: "chown user:group file で所有者とグループを同時に変えられる。chgrp はグループのみ。",
  },
  {
    cat: "権限",
    q: "ls -l の先頭が「drwxr-xr-x」のとき、これは?",
    options: ["デバイスファイル", "ディレクトリ", "シンボリックリンク", "実行ファイル"],
    answer: 1,
    why: "先頭 1 文字が種類: d=ディレクトリ, -=通常ファイル, l=リンク, b/c=デバイス。",
  },

  // ===== プロセス・システム =====
  {
    cat: "プロセス",
    q: "プロセスを強制終了するシグナルは?",
    options: ["SIGTERM (15)", "SIGKILL (9)", "SIGHUP (1)", "SIGSTOP (19)"],
    answer: 1,
    why: "kill -9 = SIGKILL は捕捉不可の強制終了。まず kill (TERM=15) で礼儀正しく、ダメなら -9。",
  },
  {
    cat: "プロセス",
    q: "フォアグラウンドのプロセスを一時停止するキーは?",
    options: ["Ctrl-C", "Ctrl-D", "Ctrl-Z", "Ctrl-S"],
    answer: 2,
    why: "Ctrl-Z で停止 → bg でバックグラウンド再開、fg で前面へ。Ctrl-C は終了 (SIGINT)。",
  },
  {
    cat: "プロセス",
    q: "ディスクの空き容量を確認するコマンドは?",
    options: ["du -h", "df -h", "free -h", "lsblk"],
    answer: 1,
    why: "df = disk free (ファイルシステム単位)。du = disk usage (ディレクトリ単位)。対で覚える。",
  },
  {
    cat: "プロセス",
    q: "メモリの使用状況を見るコマンドは?",
    options: ["mem", "free -h", "df -m", "vmstat -m"],
    answer: 1,
    why: "free -h が定番。available 列が「実際に使える量」(buff/cache は回収可能)。",
  },
  {
    cat: "プロセス",
    q: "「nice 値」が意味するのは?",
    options: ["メモリ上限", "CPU スケジューリングの優先度", "ファイルディスクリプタ数", "プロセスの生存時間"],
    answer: 1,
    why: "nice は -20 (高優先) 〜 19 (低優先)。値が大きい=他に CPU を譲る「親切」なプロセス。",
  },

  // ===== ネットワーク =====
  {
    cat: "ネットワーク",
    q: "現在の IP アドレスを確認するモダンなコマンドは?",
    options: ["ipconfig", "ip addr", "netcfg", "ifstat"],
    answer: 1,
    why: "ip addr (ip a)。ifconfig は非推奨の旧コマンド。ルーティングは ip route。",
  },
  {
    cat: "ネットワーク",
    q: "リッスン中の TCP ポートを確認するのは?",
    options: ["ss -tlnp", "ping -p", "dig -t", "ip port"],
    answer: 0,
    why: "ss (socket statistics) の -t(TCP) -l(listen) -n(数値) -p(プロセス)。netstat の後継。",
  },
  {
    cat: "ネットワーク",
    q: "ドメイン名から IP を引くコマンドは?",
    options: ["ping", "dig", "route", "arp"],
    answer: 1,
    why: "dig example.com (または host)。DNS の調査は dig が定番。+short で簡潔表示。",
  },
  {
    cat: "ネットワーク",
    q: "HTTP ステータス 403 の意味は?",
    options: ["見つからない", "認証が必要", "アクセス禁止", "サーバ内部エラー"],
    answer: 2,
    why: "403 Forbidden = 権限なし。401 は未認証、404 は Not Found、500 はサーバエラー。",
  },

  // ===== シェル =====
  {
    cat: "シェル",
    q: "「cmd1 && cmd2」の意味は?",
    options: ["並列実行", "cmd1 成功時のみ cmd2 実行", "cmd1 失敗時のみ cmd2 実行", "出力を渡す"],
    answer: 1,
    why: "&& は AND (成功 = 終了コード 0 のとき続行)。|| は失敗時のみ。| は出力を渡すパイプ。",
  },
  {
    cat: "シェル",
    q: "「2>&1」の意味は?",
    options: ["2行目を1行目へ", "標準エラーを標準出力へ合流", "2回実行して1回出力", "終了コードを変更"],
    answer: 1,
    why: "FD 2 (stderr) を FD 1 (stdout) と同じ先へ。cmd > log 2>&1 でエラーもログに入る。",
  },
  {
    cat: "シェル",
    q: "直前のコマンドの終了コードを見る変数は?",
    options: ["$!", "$?", "$#", "$$"],
    answer: 1,
    why: "$? が終了コード (0=成功)。$# は引数の数、$$ は自身の PID、$! は直前の背景ジョブ PID。",
  },
  {
    cat: "シェル",
    q: "「echo {1..3}」の出力は?",
    options: ["{1..3}", "1..3", "1 2 3", "123"],
    answer: 2,
    why: "ブレース展開。mkdir dir{a,b,c} や touch log{1..10}.txt のように量産に便利。",
  },
  {
    cat: "シェル",
    q: "コマンドの出力を変数に入れる書き方は?",
    options: ["x = `cmd`", "x=$(cmd)", "x<-(cmd)", "set x cmd"],
    answer: 1,
    why: "x=$(cmd) (コマンド置換)。= の前後にスペースを入れないのが bash の鉄則。",
  },
  {
    cat: "シェル",
    q: "履歴から「git」を含む過去のコマンドを対話検索するキーは?",
    options: ["Ctrl-F", "Ctrl-R", "Ctrl-H", "Tab Tab"],
    answer: 1,
    why: "Ctrl-R で逆方向インクリメンタル検索。もう一度 Ctrl-R で更に遡る。",
  },

  // ===== Git =====
  {
    cat: "Git",
    q: "git add の役割は?",
    options: ["コミットを作る", "変更をステージング (インデックス) に登録", "リモートへ送る", "ブランチを作る"],
    answer: 1,
    why: "作業ツリー → (add) → インデックス → (commit) → リポジトリ の三段構え。",
  },
  {
    cat: "Git",
    q: "新しいブランチを作って同時に切り替えるのは?",
    options: ["git branch -m new", "git checkout -b new", "git switch new", "git merge new"],
    answer: 1,
    why: "checkout -b (または新しい書き方の switch -c)。switch new は既存ブランチへの切替。",
  },
  {
    cat: "Git",
    q: "ステージ済みの変更と HEAD の差分を見るのは?",
    options: ["git diff", "git diff --staged", "git status -v", "git show HEAD"],
    answer: 1,
    why: "git diff は「作業ツリー vs ステージ」、--staged (--cached) は「ステージ vs HEAD」。",
  },
  {
    cat: "Git",
    q: "直前のコミットメッセージを修正するのは?",
    options: ["git commit --amend", "git rebase -m", "git reset --hard", "git revert HEAD"],
    answer: 0,
    why: "--amend は直前のコミットを作り直す。push 済みのコミットに使うのは要注意。",
  },

  // ===== エディタ =====
  {
    cat: "エディタ",
    q: "vim で保存して終了するコマンドは?",
    options: [":q!", ":wq", ":e!", ":x!"],
    answer: 1,
    why: ":wq (= :x = ZZ)。保存せず強制終了は :q!。「Vim から出られない」を卒業しよう。",
  },
  {
    cat: "エディタ",
    q: "vim の normal モードで「dd」は何をする?",
    options: ["1文字削除", "行を削除 (カット)", "やり直し", "下に移動"],
    answer: 1,
    why: "dd は行削除でレジスタに入る (p で貼り付け = カット&ペースト)。yy はコピー。",
  },
  {
    cat: "エディタ",
    q: "Emacs で「C-x C-s」は?",
    options: ["終了", "保存", "検索", "取り消し"],
    answer: 1,
    why: "C-x C-s = save。終了は C-x C-c、検索は C-s (isearch)、取り消しは C-/。",
  },
  {
    cat: "エディタ",
    q: "tmux でウィンドウを縦に分割する (左右に並べる) のは?",
    options: ["Ctrl-b %", 'Ctrl-b "', "Ctrl-b c", "Ctrl-b o"],
    answer: 0,
    why: '% が縦分割 (左右)、" が横分割 (上下)。o や矢印でペイン間を移動。',
  },

  // ===== ファイルシステム =====
  {
    cat: "ファイルシステム",
    q: "/etc ディレクトリに置かれるのは?",
    options: ["ユーザのホーム", "システムの設定ファイル", "デバイスファイル", "一時ファイル"],
    answer: 1,
    why: "/etc=設定, /home=ホーム, /dev=デバイス, /tmp=一時, /var=ログ等の可変データ。FHS は頻出。",
  },
  {
    cat: "ファイルシステム",
    q: "ログファイルが置かれる標準的な場所は?",
    options: ["/usr/log", "/etc/log", "/var/log", "/opt/log"],
    answer: 2,
    why: "/var/log/syslog や /var/log/auth.log など。journalctl で見る systemd ジャーナルもある。",
  },
  {
    cat: "ファイルシステム",
    q: "ハードリンクとシンボリックリンクの違いとして正しいのは?",
    options: [
      "ハードリンクはディレクトリにも張れる",
      "シンボリックリンクは別ファイルシステムを指せる",
      "ハードリンクは元を消すと壊れる",
      "シンボリックリンクは inode を共有する",
    ],
    answer: 1,
    why: "symlink はパスを指すだけなので FS をまたげる (壊れもする)。hard link は同じ inode の別名。",
  },
  {
    cat: "ファイルシステム",
    q: "「df -i」で確認できるのは?",
    options: ["I/O 速度", "inode の使用状況", "マウントオプション", "ディスクの温度"],
    answer: 1,
    why: "容量が空いていても inode が枯渇するとファイルを作れない。小さいファイル大量時の落とし穴。",
  },
  {
    cat: "ファイルシステム",
    q: "マウント中のファイルシステム一覧を見るのは?",
    options: ["mount", "fdisk -l", "mkfs", "fsck"],
    answer: 0,
    why: "mount (引数なし) か findmnt。fdisk はパーティション操作、mkfs は作成、fsck は検査。",
  },

  // ===== アーカイブ =====
  {
    cat: "アーカイブ",
    q: "tar czf backup.tar.gz dir の「c z f」の意味は?",
    options: ["作成・gzip・ファイル指定", "確認・zip・強制", "コピー・圧縮率・高速", "作成・暗号化・フィルタ"],
    answer: 0,
    why: "c=create, z=gzip, f=ファイル名指定。展開は x に変えて tar xzf。一覧は t。",
  },
  {
    cat: "アーカイブ",
    q: "file.gz を元に戻すコマンドは?",
    options: ["ungzip file.gz", "gunzip file.gz", "gzip -c file.gz", "unzip file.gz"],
    answer: 1,
    why: "gunzip (= gzip -d)。unzip は .zip 用。xz なら unxz / xz -d。",
  },
  {
    cat: "アーカイブ",
    q: "tar.gz の中身を展開せずに確認するのは?",
    options: ["tar tzf file.tar.gz", "tar xzf file.tar.gz", "cat file.tar.gz", "gzip -l file.tar.gz"],
    answer: 0,
    why: "t = list。展開前に中身とパス構造を確認するのは事故防止の基本動作。",
  },

  // ===== systemd・サービス =====
  {
    cat: "systemd",
    q: "サービスを OS 起動時に自動起動させるのは?",
    options: ["systemctl start nginx", "systemctl enable nginx", "systemctl reload nginx", "service nginx on"],
    answer: 1,
    why: "enable=自動起動 ON (今すぐ起動は start)。enable --now で両方やるのが実務の定番。",
  },
  {
    cat: "systemd",
    q: "サービスのログを見るコマンドは?",
    options: ["syslog nginx", "journalctl -u nginx", "systemctl log nginx", "dmesg -u nginx"],
    answer: 1,
    why: "journalctl -u <unit>。-f で follow、--since today などの絞り込みも頻出。",
  },
  {
    cat: "systemd",
    q: "cron で「毎日 3:30」に実行する書式は?",
    options: ["30 3 * * *", "3 30 * * *", "* * 3 30 *", "30 3 * * 0"],
    answer: 0,
    why: "分 時 日 月 曜日 の順。末尾 0 は日曜のみ。crontab -e で編集、-l で確認。",
  },

  // ===== パッケージ =====
  {
    cat: "パッケージ",
    q: "Debian 系でパッケージをインストールするのは?",
    options: ["yum install", "apt install", "rpm -i", "dnf add"],
    answer: 1,
    why: "Debian/Ubuntu=apt (dpkg)、RHEL 系=dnf/yum (rpm)。系統の対応は LPIC 頻出。",
  },
  {
    cat: "パッケージ",
    q: "インストール済みパッケージにどのファイルが属するか調べる (Debian 系) のは?",
    options: ["dpkg -S /bin/ls", "apt find /bin/ls", "dpkg -i /bin/ls", "apt-cache rdepends"],
    answer: 0,
    why: "dpkg -S (search)。逆にパッケージの中身一覧は dpkg -L <pkg>。",
  },

  // ===== セキュリティ =====
  {
    cat: "セキュリティ",
    q: "sudo の設定ファイルを安全に編集するコマンドは?",
    options: ["vi /etc/sudoers", "visudo", "sudoedit /etc/passwd", "chmod 777 /etc/sudoers"],
    answer: 1,
    why: "visudo は文法チェック付きで保存するため、ミスでロックアウトされる事故を防げる。",
  },
  {
    cat: "セキュリティ",
    q: "SSH の公開鍵認証で、サーバ側に置くファイルは?",
    options: ["~/.ssh/id_rsa", "~/.ssh/authorized_keys", "~/.ssh/known_hosts", "/etc/ssh/sshd_config"],
    answer: 1,
    why: "公開鍵を authorized_keys へ。秘密鍵 (id_rsa) は絶対に配らない。known_hosts は接続先の記録。",
  },
  {
    cat: "セキュリティ",
    q: "setuid ビットが立った実行ファイルの意味は?",
    options: ["所有者の権限で実行される", "誰も実行できない", "起動時に自動実行される", "削除できない"],
    answer: 0,
    why: "passwd コマンド等は setuid root で動く。ls -l では rws のように s が見える。",
  },
  {
    cat: "セキュリティ",
    q: "ファイルのハッシュ値 (SHA-256) を確認するのは?",
    options: ["md5check file", "sha256sum file", "hash -a 256 file", "openssl rand file"],
    answer: 1,
    why: "ダウンロードしたファイルの改竄チェックの基本。md5sum は衝突攻撃があり検証用途では非推奨。",
  },

  // ===== パイプ・リダイレクト =====
  {
    cat: "パイプ",
    q: "「ls /nope > out.txt 2>&1」で out.txt に入るのは?",
    options: ["何も入らない", "エラーメッセージ", "ls の正常出力のみ", "終了コード"],
    answer: 1,
    why: "/nope は存在しないので stderr にエラーが出る。2>&1 でそれも out.txt へ合流する。",
  },
  {
    cat: "パイプ",
    q: "「cmd | tee log.txt」の動作は?",
    options: ["log.txt に保存だけする", "画面に表示しつつ log.txt にも保存", "log.txt を入力にする", "2回実行する"],
    answer: 1,
    why: "tee は T 字パイプ。-a で追記。「見ながら残す」運用作業の定番。",
  },
  {
    cat: "パイプ",
    q: "「xargs」の役割は?",
    options: ["引数を環境変数にする", "標準入力をコマンドの引数に変換する", "コマンドを並列実行する", "引数の数を数える"],
    answer: 1,
    why: "find ... | xargs wc -l のように「出力 → 引数」の橋渡し。-n1 で1件ずつ実行。",
  },
  {
    cat: "パイプ",
    q: "「sort -n」の -n が必要なのはなぜ?",
    options: ["逆順にするため", "数値として比較するため", "重複を消すため", "高速化のため"],
    answer: 1,
    why: "無いと辞書順になり 10 < 9 になってしまう (「10」 < 「9」)。-h は 1K/2M などの単位付き対応。",
  },

  // ===== 正規表現 =====
  {
    cat: "正規表現",
    q: "正規表現「^#」が一致するのは?",
    options: ["# を含む行", "# で始まる行", "# で終わる行", "# のみの行"],
    answer: 1,
    why: "^ は行頭、$ は行末。grep -v '^#' で設定ファイルのコメント行を除くのは定番。",
  },
  {
    cat: "正規表現",
    q: "「[0-9]{3}」が一致するのは?",
    options: ["数字3個の並び", "0,9,3 のどれか", "3桁以下の数", "0〜9 を3回繰り返す行全体"],
    answer: 0,
    why: "[0-9] は数字1文字、{3} は直前の3回繰り返し。ERE では {} がそのまま使える (BRE は \\{ \\})。",
  },
  {
    cat: "正規表現",
    q: "「.*」の意味は?",
    options: ["ドットとアスタリスク", "任意の1文字", "任意の文字の0回以上の繰り返し", "ファイルのグロブ"],
    answer: 2,
    why: ". は任意の1文字、* は直前の0回以上。シェルのグロブ (*) と正規表現は別物という点が重要。",
  },
];
