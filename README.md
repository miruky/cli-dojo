# cli-dojo 🥋

ブラウザだけで完結する **CLI 練習道場**。
Linux / Ghostty / tmux / Neovim / Emacs を、実際に動くコマンドラインとレッスンで練習できます。

> 🌐 公開URL: https://miruky.github.io/cli-dojo/

## これは何か

- **本当に動く端末**: ブラウザ内の仮想ファイルシステム上で `ls` `grep` `sed` `awk` `find` などが実際に動作。
- **モード切替**: Linux シェル / tmux / Neovim / Emacs / Ghostty を、コマンドでもハンバーガーメニューのボタンでも切替。
- **実機準拠のショートカット**: 利用者の ghostty 設定（ペイン分割・移動・リサイズ）や tmux/emacs/vim の標準キーバインドに準拠。
- **レッスン & チートシート**: 基礎から LPIC レベル3、複雑な正規表現まで。見やすい設計で「Try」ボタンから端末に直接流し込み。

## 開発

```bash
npm install      # 依存インストール
npm run dev      # 開発サーバ (http://localhost:5173)
npm run build    # 本番ビルド (dist/)
npm run preview  # ビルド結果のプレビュー
```

## 技術スタック

- Vite + TypeScript
- [@xterm/xterm](https://xtermjs.org/) — ブラウザ端末
- GitHub Actions → GitHub Pages 自動デプロイ

## 実装済み機能

- **本物のシェル**: 仮想FS上で 200+ コマンド (ls/grep/sed/awk/find/tar/chmod/systemctl…)、
  パイプ・リダイレクト・`&&`/`||`・glob・ブレース・コマンド置換・`$(())` 算術。
- **チャレンジ道場 (全50問)**: `challenge` で出題 → 端末で実際に解く → `check`/`answer` で自動判定。
  基礎/パイプ/正規表現/find/JSON/awk/Git/エディタ/スクリプト/上級複合。クリア数で帯が上がる (白帯→黒帯)。
- **クイズ & 日課**: `quiz` (LPIC風4択60問・解説付き)、`quiz review` (間違えた問題だけ復習)、
  `daily` (日替わり5問で連続日数 🔥)、`stats` (使用コマンドTOP10などの修行統計)、`vimtutor`。
- **パイプ実践レシピ**: `ls -la | grep '^d'` からログ集計ワンライナーまで、
  クリックで端末に流し込める実務レシピ集。
- **Git (本当に動く)**: init/status/add/commit/log/diff/show/branch/checkout が VFS 上で動作。
  ブランチ切替で作業ツリーも書き換わる。
- **全画面 TUI アプリ**: `man`/`less` (検索付きページャ)、`htop` (リアルタイム更新)、
  `watch`、`fzf` (ファジーファインダ)、`cmatrix`、`sl`。
- **モダン CLI ツール**: eza (アイコン付き ls)・bat (ハイライト cat)・fd・rg (ripgrep)・
  jq・tldr・dust・duf・procs・z (zoxide)。
- **お楽しみ**: neofetch・figlet・lolcat・cowsay・fortune — `fortune | cowsay | lolcat` まで動く。
- **シェルスクリプト**: if/for/while/until/case/関数/`[ ]`/`[[ ]]`/`$1..$@`/`source`/`./x.sh`。
- **テキスト処理/正規表現**: grep(BRE/ERE/POSIX)、sed(hold/分岐)、awk(処理系)、diff(-u)。
- **LPIC-3 の幅**: 権限・プロセス・ネットワーク・パッケージ・systemd・openssl・暗号ハッシュ。
- **ペイン (Ghostty 準拠)**: ctrl+h/j/k/l 移動, ctrl+shift+v/h 分割, ctrl+x 閉じる, リサイズ。
- **tmux モード**: prefix Ctrl-b でウィンドウ/ペイン多重化、ステータスバー。
- **Neovim モード**: モーダル編集・モーション・オペレータ・Ex・検索・相対行番号。
- **Emacs モード**: C-x プレフィックス・kill ring・mark/region・isearch・dired・tab-line。
- **レッスン/チートシート**: 検索可能なリファレンス + 「Try」で端末へ送信。
- **キーバインド早見表**: 右上の `?` から全モードのキー一覧。

すべて Phase 0〜11 として段階的に実装・デプロイ済み。

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
