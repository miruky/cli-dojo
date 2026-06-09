/** レッスン/チートシートのデータ。各 item の cmd は「Try」で端末へ送れる。 */
export interface CheatItem {
  cmd: string;
  desc: string;
  /** keys=true ならキーバインド表記 (Try ボタンを出さない)。 */
  keys?: boolean;
}
export interface CheatSection {
  title: string;
  items: CheatItem[];
}
export interface Lesson {
  id: string;
  group: string;
  title: string;
  icon: string;
  accent: string;
  intro: string;
  sections: CheatSection[];
}

const GREEN = "var(--accent-green)";
const CYAN = "var(--accent-cyan)";
const MAGENTA = "var(--accent-magenta)";
const YELLOW = "var(--accent)";
const BLUE = "var(--accent-blue)";

export const LESSONS: Lesson[] = [
  {
    id: "basics",
    icon: "terminal-square",
    group: "Linux",
    title: "基礎・ナビゲーション",
    accent: GREEN,
    intro: "まずはここから。ディレクトリ移動とファイルの中身を見る基本。",
    sections: [
      {
        title: "現在地と移動",
        items: [
          { cmd: "pwd", desc: "現在のディレクトリを表示" },
          { cmd: "ls", desc: "ファイル一覧" },
          { cmd: "ls -la", desc: "隠しファイル含め詳細表示 (権限/所有者/サイズ/日時)" },
          { cmd: "ls -lhS", desc: "サイズ順 (人間可読)" },
          { cmd: "cd projects", desc: "ディレクトリへ移動" },
          { cmd: "cd ..", desc: "1つ上へ" },
          { cmd: "cd -", desc: "直前のディレクトリへ戻る" },
          { cmd: "cd", desc: "ホームディレクトリへ" },
          { cmd: "tree", desc: "階層をツリー表示" },
        ],
      },
      {
        title: "ファイルを見る",
        items: [
          { cmd: "cat README.txt", desc: "ファイル全体を表示" },
          { cmd: "cat -n notes.md", desc: "行番号付きで表示" },
          { cmd: "head -3 data/numbers.txt", desc: "先頭3行" },
          { cmd: "tail -2 todo.txt", desc: "末尾2行" },
          { cmd: "wc -l data/access.log", desc: "行数を数える" },
          { cmd: "file projects/hello.sh", desc: "ファイルの種類を推定" },
          { cmd: "stat todo.txt", desc: "詳細情報 (サイズ/権限/更新時刻)" },
        ],
      },
      {
        title: "ヘルプ",
        items: [
          { cmd: "help", desc: "cli-dojo で使えるコマンド一覧" },
          { cmd: "type ll", desc: "コマンド/エイリアスの正体を表示" },
          { cmd: "which grep", desc: "実行ファイルのパス" },
        ],
      },
    ],
  },
  {
    id: "files",
    icon: "folder",
    group: "Linux",
    title: "ファイル操作",
    accent: GREEN,
    intro: "作る・コピー・移動・消す・探す。",
    sections: [
      {
        title: "作成・コピー・移動・削除",
        items: [
          { cmd: "mkdir -p work/sub", desc: "親ごとディレクトリ作成 (-p)" },
          { cmd: "touch work/a.txt", desc: "空ファイル作成 / 更新時刻変更" },
          { cmd: "cp README.txt work/", desc: "コピー" },
          { cmd: "cp -r projects work/", desc: "ディレクトリを再帰コピー" },
          { cmd: "mv work/a.txt work/b.txt", desc: "名前変更 / 移動" },
          { cmd: "rm work/b.txt", desc: "ファイル削除" },
          { cmd: "rm -r work", desc: "ディレクトリごと削除 (-r)" },
          { cmd: "ln -s README.txt link", desc: "シンボリックリンク作成" },
        ],
      },
      {
        title: "探す (find)",
        items: [
          { cmd: 'find . -name "*.txt"', desc: "名前で再帰検索 (パターンは引用符で)" },
          { cmd: "find . -type d", desc: "ディレクトリだけ" },
          { cmd: "find data -type f -size +200c", desc: "200バイト超のファイル" },
          { cmd: 'find . -name "*.csv" -exec wc -l {} \\;', desc: "見つけた各ファイルにコマンド実行" },
          { cmd: 'find . -name "*.log" | xargs wc -l', desc: "xargs で引数化" },
        ],
      },
      {
        title: "ディスク使用量",
        items: [
          { cmd: "du -sh data", desc: "ディレクトリの合計サイズ" },
          { cmd: "du -h --max-depth=1", desc: "1階層ごとの内訳" },
          { cmd: "df -h", desc: "ファイルシステムの空き容量" },
        ],
      },
    ],
  },
  {
    id: "text",
    icon: "scissors",
    group: "Linux",
    title: "テキスト処理・パイプ",
    accent: CYAN,
    intro: "grep / sed / awk とパイプで自在に加工。LPIC/実務の核心。",
    sections: [
      {
        title: "grep (検索)",
        items: [
          { cmd: "grep -n TODO todo.txt", desc: "一致行を行番号付きで" },
          { cmd: "grep -i todo todo.txt", desc: "大小無視" },
          { cmd: "grep -v DONE todo.txt", desc: "一致しない行 (反転)" },
          { cmd: "grep -c TODO todo.txt", desc: "一致した行数" },
          { cmd: "grep -rn ERROR logs", desc: "ディレクトリを再帰検索" },
          { cmd: 'grep -A1 -B1 ERROR logs/app.log', desc: "前後の文脈も表示" },
        ],
      },
      {
        title: "パイプで集計",
        items: [
          { cmd: "cat data/fruits.txt | sort | uniq -c | sort -rn", desc: "出現回数ランキング (頻度集計の定番)" },
          { cmd: "sort -n data/numbers.txt | uniq", desc: "数値ソート + 重複除去" },
          { cmd: "cut -d, -f2 data/scores.csv | tail -n +2 | sort -u", desc: "CSV の2列目をユニーク表示" },
          { cmd: "echo hello world | tr a-z A-Z", desc: "小文字→大文字 変換" },
          { cmd: "wc -l todo.txt data/numbers.txt", desc: "複数ファイルの行数 + 合計" },
        ],
      },
      {
        title: "sed (置換・編集)",
        items: [
          { cmd: "sed 's/TODO/DONE/g' todo.txt", desc: "全置換 (g)" },
          { cmd: "sed -n '2,4p' data/numbers.txt", desc: "2〜4行目だけ表示 (-n + p)" },
          { cmd: "sed '/DONE/d' todo.txt", desc: "DONE を含む行を削除" },
          { cmd: "echo hello | sed 's/.*/\\U&/'", desc: "大文字化 (\\U & は一致全体)" },
        ],
      },
      {
        title: "awk (フィールド処理)",
        items: [
          { cmd: "awk '{print $1}' data/access.log", desc: "1列目 (IP) を表示" },
          { cmd: "awk -F, 'NR>1{print $1, $3}' data/scores.csv", desc: "区切り指定 -F, ヘッダ除外 NR>1" },
          { cmd: "awk -F, 'NR>1{s+=$3} END{print \"合計\", s}' data/scores.csv", desc: "合計を集計 (END ブロック)" },
          { cmd: "awk -F, 'NR>1{a[$1]+=$3} END{for(k in a) print k, a[k]}' data/scores.csv", desc: "連想配列でグループ集計" },
        ],
      },
    ],
  },
  {
    id: "regex",
    icon: "regex",
    group: "Linux",
    title: "正規表現 (深掘り)",
    accent: CYAN,
    intro: "BRE/ERE の違いと、grep -E / sed での実践パターン。",
    sections: [
      {
        title: "基本パーツ",
        items: [
          { cmd: ".", desc: "任意の1文字", keys: true },
          { cmd: "*", desc: "直前の0回以上の繰り返し", keys: true },
          { cmd: "^ $", desc: "行頭 / 行末アンカー", keys: true },
          { cmd: "[abc] [^abc]", desc: "文字クラス / 否定", keys: true },
          { cmd: "[[:digit:]] [[:alpha:]]", desc: "POSIX クラス (数字/英字)", keys: true },
          { cmd: "\\< \\>", desc: "単語境界 (先頭/末尾)", keys: true },
        ],
      },
      {
        title: "ERE (grep -E / egrep)",
        items: [
          { cmd: "+  ?  |  ( )  {n,m}", desc: "ERE では特殊。BRE では \\+ \\? \\| \\( \\) \\{ \\}", keys: true },
          { cmd: 'grep -oE "[0-9]{3}-[0-9]{4}-[0-9]{4}" notes.md', desc: "電話番号を抽出 (-o は一致部分のみ)" },
          { cmd: 'grep -oE "[a-z]+@[a-z.]+" notes.md', desc: "メールアドレスを抽出" },
          { cmd: 'grep -E "TODO|DONE" todo.txt', desc: "OR 検索" },
          { cmd: 'grep -wE "[0-9]+" data/words.txt', desc: "-w で単語単位の数値" },
        ],
      },
      {
        title: "後方参照・置換",
        items: [
          { cmd: "echo 'hello world' | sed -E 's/(\\w+) (\\w+)/\\2 \\1/'", desc: "グループを入れ替え (\\1 \\2)" },
          { cmd: "grep -E '^192\\.168\\.' data/words.txt", desc: "プライベートIPで始まる行 (. をエスケープ)" },
        ],
      },
    ],
  },
  {
    id: "perms",
    icon: "key",
    group: "Linux",
    title: "権限・ユーザー",
    accent: YELLOW,
    intro: "chmod / chown / umask と /etc のユーザー管理。",
    sections: [
      {
        title: "パーミッション",
        items: [
          { cmd: "ls -l todo.txt", desc: "rwx の確認 (所有者/グループ/その他)" },
          { cmd: "chmod 644 todo.txt", desc: "8進数で設定 (rw-r--r--)" },
          { cmd: "chmod u+x projects/hello.sh", desc: "記号で実行権付与" },
          { cmd: "chmod -R go-w projects", desc: "再帰的にグループ/他の書込を剥奪" },
          { cmd: "umask", desc: "新規ファイルのマスク確認" },
          { cmd: "umask -S", desc: "記号表記で表示" },
        ],
      },
      {
        title: "所有者・ユーザー",
        items: [
          { cmd: "chown guest:guest todo.txt", desc: "所有者:グループを変更" },
          { cmd: "id", desc: "uid/gid/所属グループ" },
          { cmd: "whoami", desc: "現在のユーザー" },
          { cmd: "getent passwd guest", desc: "/etc/passwd から検索" },
          { cmd: "sudo useradd -m bob", desc: "ユーザー追加 (/etc/passwd に追記)" },
          { cmd: "getent passwd", desc: "全ユーザー一覧" },
        ],
      },
    ],
  },
  {
    id: "process",
    icon: "cpu",
    group: "Linux",
    title: "プロセス・サービス",
    accent: BLUE,
    intro: "ps / top / kill とサービス管理 (systemd)。",
    sections: [
      {
        title: "プロセス",
        items: [
          { cmd: "ps", desc: "自分のプロセス" },
          { cmd: "ps aux", desc: "全プロセス (BSD 形式)" },
          { cmd: "ps aux | grep sshd", desc: "プロセスを絞り込み" },
          { cmd: "top", desc: "リソース使用状況のスナップショット" },
          { cmd: "free -h", desc: "メモリ使用状況" },
          { cmd: "uptime", desc: "稼働時間とロードアベレージ" },
        ],
      },
      {
        title: "systemd / サービス (LPIC)",
        items: [
          { cmd: "systemctl status nginx", desc: "サービス状態" },
          { cmd: "systemctl list-units", desc: "ユニット一覧" },
          { cmd: "sudo systemctl restart nginx", desc: "再起動" },
          { cmd: "journalctl -u nginx", desc: "サービスのログ" },
        ],
      },
    ],
  },
  {
    id: "lpic3",
    icon: "globe",
    group: "Linux",
    title: "ネットワーク・LPIC-3",
    accent: BLUE,
    intro: "ネットワーク調査、パッケージ、暗号、cron など上位トピック。",
    sections: [
      {
        title: "ネットワーク",
        items: [
          { cmd: "ip a", desc: "インターフェース/IP" },
          { cmd: "ip route", desc: "ルーティングテーブル" },
          { cmd: "ss -tln", desc: "待ち受けTCPポート" },
          { cmd: "ping -c2 example.com", desc: "到達性 (模擬)" },
          { cmd: "dig example.com", desc: "DNS 問い合わせ" },
          { cmd: "curl -s ifconfig.me", desc: "グローバルIP取得 (模擬)" },
        ],
      },
      {
        title: "パッケージ / 暗号 / 自動実行",
        items: [
          { cmd: "apt list bash", desc: "パッケージ確認 (Debian系)" },
          { cmd: "dpkg -l", desc: "インストール済み一覧" },
          { cmd: "openssl version", desc: "OpenSSL バージョン" },
          { cmd: "openssl rand -hex 16", desc: "ランダム値生成 (実乱数)" },
          { cmd: "openssl dgst -sha256 todo.txt", desc: "SHA-256 ダイジェスト (実ハッシュ)" },
          { cmd: "sha256sum todo.txt", desc: "チェックサム (実計算)" },
          { cmd: "crontab -l", desc: "cron ジョブ一覧" },
        ],
      },
      {
        title: "アーカイブ",
        items: [
          { cmd: "tar -czf /tmp/backup.tar projects", desc: "tar で固める" },
          { cmd: "tar -tzf /tmp/backup.tar", desc: "中身を一覧" },
          { cmd: "base64 todo.txt | head -2", desc: "Base64 エンコード" },
        ],
      },
    ],
  },
  {
    id: "containers",
    icon: "box",
    group: "Linux",
    title: "コンテナ (LPIC-3 304)",
    accent: BLUE,
    intro: "Docker / Podman / Kubernetes。コンテナの一覧・起動・イメージ・オーケストレーション。",
    sections: [
      {
        title: "Docker / Podman 基本",
        items: [
          { cmd: "docker ps", desc: "稼働中コンテナ一覧" },
          { cmd: "docker ps -a", desc: "停止済みも含めて一覧" },
          { cmd: "docker images", desc: "ローカルのイメージ一覧" },
          { cmd: "docker pull debian:12", desc: "イメージを取得" },
          { cmd: "docker run -d nginx:1.27", desc: "バックグラウンドでコンテナ起動 (-d)" },
          { cmd: "docker exec -it web bash", desc: "稼働中コンテナ内でシェル (-it)" },
          { cmd: "docker logs web", desc: "コンテナのログ表示" },
          { cmd: "docker build -t myapp .", desc: "Dockerfile からイメージ構築" },
          { cmd: "docker info", desc: "デーモン/ストレージ/cgroup 情報" },
          { cmd: "podman ps", desc: "Podman (rootless 互換) でも同じ" },
        ],
      },
      {
        title: "Docker Compose",
        items: [
          { cmd: "docker compose up", desc: "compose.yaml の全サービス起動" },
          { cmd: "docker compose ps", desc: "compose 管理下の状態" },
          { cmd: "docker compose down", desc: "停止して削除" },
        ],
      },
      {
        title: "Kubernetes (kubectl)",
        items: [
          { cmd: "kubectl get nodes", desc: "ノード一覧" },
          { cmd: "kubectl get pods", desc: "Pod 一覧" },
          { cmd: "kubectl get svc", desc: "Service 一覧" },
          { cmd: "kubectl get ns", desc: "Namespace 一覧" },
          { cmd: "kubectl describe pod web-7d9f8c6b5d-2xk4p", desc: "Pod の詳細" },
          { cmd: "kubectl apply -f deploy.yaml", desc: "マニフェストを適用" },
          { cmd: "kubectl cluster-info", desc: "クラスタのエンドポイント" },
          { cmd: "kubectl version", desc: "クライアント/サーバ版数" },
        ],
      },
    ],
  },
  {
    id: "virt",
    icon: "server",
    group: "Linux",
    title: "仮想化・名前空間 (LPIC-3 305)",
    accent: GREEN,
    intro: "KVM/libvirt・Vagrant・LXD と、コンテナの土台となる namespace / cgroup。",
    sections: [
      {
        title: "KVM / libvirt (virsh)",
        items: [
          { cmd: "virsh list --all", desc: "全ドメイン(VM)を一覧" },
          { cmd: "virsh dominfo web-vm", desc: "VM の詳細 (CPU/メモリ/状態)" },
          { cmd: "virsh start build-vm", desc: "VM を起動" },
          { cmd: "virsh shutdown web-vm", desc: "VM を正常停止" },
          { cmd: "virsh nodeinfo", desc: "ホストの CPU/メモリ情報" },
          { cmd: "virsh net-list", desc: "仮想ネットワーク一覧" },
        ],
      },
      {
        title: "Vagrant / LXD",
        items: [
          { cmd: "vagrant status", desc: "Vagrant VM の状態" },
          { cmd: "vagrant up", desc: "VM を起動・プロビジョン" },
          { cmd: "vagrant halt", desc: "VM を停止" },
          { cmd: "lxc list", desc: "LXD システムコンテナ一覧" },
          { cmd: "lxc launch images:debian/12 web", desc: "コンテナを作成・起動" },
        ],
      },
      {
        title: "名前空間 / cgroup (コンテナの基盤)",
        items: [
          { cmd: "lsns", desc: "Linux 名前空間 (mnt/pid/net…) 一覧" },
          { cmd: "unshare --pid --fork --mount-proc bash", desc: "新しい名前空間で実行 (例)" },
          { cmd: "nsenter -t 1820 -n ip a", desc: "既存プロセスの NS に入る (例)" },
          { cmd: "machinectl list", desc: "systemd 管理のマシン/コンテナ" },
          { cmd: "systemd-nspawn -D /var/lib/machines/debian -b", desc: "ディレクトリを軽量コンテナ起動 (例)" },
        ],
      },
    ],
  },
  {
    id: "scripting",
    icon: "scroll",
    group: "Linux",
    title: "シェルスクリプト",
    accent: YELLOW,
    intro: "if / for / while / 関数 / test。$? や $(()) も。",
    sections: [
      {
        title: "制御構文",
        items: [
          { cmd: "for i in 1 2 3; do echo \"n=$i\"; done", desc: "for ループ" },
          { cmd: "i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done", desc: "while + 算術 $(())" },
          { cmd: "if [ -f todo.txt ]; then echo ある; else echo ない; fi", desc: "if + ファイルテスト" },
          { cmd: "x=apple; case $x in a*) echo 果物;; *) echo その他;; esac", desc: "case 分岐" },
        ],
      },
      {
        title: "関数・テスト・展開",
        items: [
          { cmd: "greet() { echo \"hi $1\"; }; greet world", desc: "関数定義と引数 $1" },
          { cmd: "[ 5 -gt 3 ] && echo yes", desc: "数値比較 -gt と && " },
          { cmd: '[[ abc123 =~ [0-9]+ ]] && echo 数字あり', desc: "[[ ]] の正規表現 =~" },
          { cmd: "echo $((2 ** 10))", desc: "算術展開 (べき乗)" },
          { cmd: "printf 'a\\nb\\nc\\n' | while read x; do echo \"got $x\"; done", desc: "パイプから while read" },
        ],
      },
    ],
  },
  {
    id: "vim",
    icon: "edit",
    group: "エディタ",
    title: "Vim / Neovim",
    accent: GREEN,
    intro: "モーダル編集。`nvim <file>` で起動。Esc で normal に戻る。",
    sections: [
      {
        title: "起動",
        items: [{ cmd: "nvim notes.md", desc: "Neovim で開く (LazyVim 風)" }],
      },
      {
        title: "モーション (normal)",
        items: [
          { cmd: "h j k l", desc: "左/下/上/右", keys: true },
          { cmd: "w b e", desc: "次の単語 / 前の単語 / 単語末", keys: true },
          { cmd: "0 ^ $", desc: "行頭 / 最初の非空白 / 行末", keys: true },
          { cmd: "gg G", desc: "先頭行 / 最終行 (5G で5行目)", keys: true },
          { cmd: "f x ; ,", desc: "行内で x を検索 / 繰り返し", keys: true },
          { cmd: "% ", desc: "対応する括弧へジャンプ", keys: true },
        ],
      },
      {
        title: "編集オペレータ",
        items: [
          { cmd: "i a o O", desc: "挿入 / 後ろに挿入 / 下・上に行追加", keys: true },
          { cmd: "dd yy p", desc: "行削除 / 行ヤンク / 貼付け", keys: true },
          { cmd: "dw ciw ci\"", desc: "単語削除 / 単語変更 / 引用符内変更", keys: true },
          { cmd: "x r~ J", desc: "1字削除 / 置換 / 大小反転 / 行連結", keys: true },
          { cmd: "u  Ctrl-r  .", desc: "undo / redo / 直前の変更を繰り返し", keys: true },
          { cmd: "v V", desc: "ビジュアル選択 (文字/行)", keys: true },
        ],
      },
      {
        title: "Ex コマンド・検索",
        items: [
          { cmd: ":w  :q  :wq  :q!", desc: "保存 / 終了 / 保存して終了 / 強制終了", keys: true },
          { cmd: ":%s/old/new/g", desc: "ファイル全体を置換", keys: true },
          { cmd: "/word  n  N", desc: "検索 / 次へ / 前へ", keys: true },
          { cmd: ":set nu  :set rnu  :noh", desc: "行番号 / 相対番号 / ハイライト解除", keys: true },
        ],
      },
    ],
  },
  {
    id: "emacs",
    icon: "file-text",
    group: "エディタ",
    title: "Emacs",
    accent: MAGENTA,
    intro: "非モーダル。C- は Ctrl、M- は Alt(Meta)。`emacs <file>` で起動。",
    sections: [
      {
        title: "起動",
        items: [{ cmd: "emacs notes.md", desc: "Emacs で開く" }],
      },
      {
        title: "移動",
        items: [
          { cmd: "C-f C-b C-n C-p", desc: "前後の文字 / 上下の行", keys: true },
          { cmd: "C-a C-e", desc: "行頭 / 行末", keys: true },
          { cmd: "M-f M-b", desc: "次の単語 / 前の単語", keys: true },
          { cmd: "M-< M->", desc: "バッファ先頭 / 末尾", keys: true },
          { cmd: "C-v M-v", desc: "次のページ / 前のページ", keys: true },
        ],
      },
      {
        title: "編集",
        items: [
          { cmd: "C-d  DEL", desc: "前方削除 / 後方削除", keys: true },
          { cmd: "C-k C-y", desc: "行末まで切り取り / 貼付け (yank)", keys: true },
          { cmd: "C-Space  C-w  M-w", desc: "マーク / リージョン切取 / コピー", keys: true },
          { cmd: "C-/  (C-x u)", desc: "undo", keys: true },
        ],
      },
      {
        title: "ファイル・検索",
        items: [
          { cmd: "C-x C-f", desc: "ファイルを開く (ミニバッファ, Tab補完)", keys: true },
          { cmd: "C-x C-s", desc: "保存", keys: true },
          { cmd: "C-x C-c", desc: "終了", keys: true },
          { cmd: "C-s  C-r", desc: "インクリメンタル検索 前/後", keys: true },
          { cmd: "M-x  C-g", desc: "コマンド実行 / 中断", keys: true },
        ],
      },
      {
        title: "dired (ディレクトリ操作) — まず開く",
        items: [
          { cmd: "emacs .", desc: "カレントディレクトリを dired で開く" },
          { cmd: "emacs projects", desc: "ディレクトリを指定して dired で開く" },
        ],
      },
      {
        title: "dired の中の操作 (ネイティブ標準)",
        items: [
          { cmd: "C-x d", desc: "ミニバッファでディレクトリ指定して dired", keys: true },
          { cmd: "n / p  (↓ / ↑)", desc: "次の行 / 前の行へ", keys: true },
          { cmd: "RET / f", desc: "ファイルを開く / ディレクトリへ入る", keys: true },
          { cmd: "^", desc: "親ディレクトリへ上がる", keys: true },
          { cmd: "g", desc: "一覧を再読み込み", keys: true },
          { cmd: "M-< / M->", desc: "先頭 / 末尾の項目へ", keys: true },
          { cmd: "q", desc: "dired を閉じる (元のバッファへ)", keys: true },
        ],
      },
      {
        title: "tab-line (ファイルをタブ表示)",
        items: [
          { cmd: "M-x tab-line-mode", desc: "現在ディレクトリのファイルを上部にタブ表示", keys: true },
          { cmd: "C-x ←  /  C-x →", desc: "前 / 次のファイルのタブへ切替", keys: true },
          { cmd: "M-x global-tab-line-mode", desc: "全バッファでタブを有効化", keys: true },
        ],
      },
    ],
  },
  {
    id: "tmux",
    icon: "grid",
    group: "ツール",
    title: "tmux",
    accent: GREEN,
    intro: "端末多重化。`tmux` で起動。prefix は Ctrl-b。",
    sections: [
      {
        title: "起動",
        items: [{ cmd: "tmux", desc: "tmux セッション開始" }],
      },
      {
        title: "prefix (Ctrl-b) の後に",
        items: [
          { cmd: "Ctrl-b c", desc: "新しいウィンドウ", keys: true },
          { cmd: "Ctrl-b n / p", desc: "次 / 前のウィンドウ", keys: true },
          { cmd: "Ctrl-b 0-9", desc: "番号でウィンドウ切替", keys: true },
          { cmd: 'Ctrl-b %', desc: "ペインを縦分割 (左右)", keys: true },
          { cmd: 'Ctrl-b "', desc: "ペインを横分割 (上下)", keys: true },
          { cmd: "Ctrl-b 矢印 / o", desc: "ペイン移動 / 巡回", keys: true },
          { cmd: "Ctrl-b x", desc: "ペインを閉じる", keys: true },
          { cmd: "Ctrl-b d", desc: "デタッチ (抜ける)", keys: true },
          { cmd: "Ctrl-b [", desc: "コピーモード (スクロール)", keys: true },
          { cmd: "Ctrl-b :", desc: "コマンドプロンプト", keys: true },
        ],
      },
    ],
  },
  {
    id: "ghostty",
    icon: "ghost",
    group: "ツール",
    title: "Ghostty (あなたの設定)",
    accent: YELLOW,
    intro: "あなたの ~/.config/ghostty/config のキーバインドを再現しています。",
    sections: [
      {
        title: "ペイン移動",
        items: [
          { cmd: "ctrl+h / j / k / l", desc: "左 / 下 / 上 / 右のペインへ移動", keys: true },
        ],
      },
      {
        title: "ペイン分割・操作",
        items: [
          { cmd: "ctrl+shift+v", desc: "右に分割 (new_split:right)", keys: true },
          { cmd: "ctrl+shift+h", desc: "下に分割 (new_split:down)", keys: true },
          { cmd: "ctrl+x", desc: "ペインを閉じる (close_surface)", keys: true },
        ],
      },
      {
        title: "リサイズ・スクロール",
        items: [
          { cmd: "ctrl+, / ctrl+.", desc: "左 / 右へリサイズ", keys: true },
          { cmd: "ctrl+; / ctrl+'", desc: "下 / 上へリサイズ", keys: true },
          { cmd: "ctrl+shift+k / ctrl+shift+j", desc: "上 / 下へスクロール", keys: true },
        ],
      },
      {
        title: "外観 (config)",
        items: [
          { cmd: "background-opacity = 0.8", desc: "背景の透明度", keys: true },
          { cmd: "background-blur-radius = 20", desc: "背景ブラー", keys: true },
          { cmd: "theme = Cobalt Next / font = HackGen Console NF", desc: "テーマとフォント", keys: true },
        ],
      },
    ],
  },
];
