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

## ロードマップ（フェーズ）

Phase 0 足場/デプロイ · 1 デザイン · 2 Readline · 3 仮想FS+シェル ·
4 テキスト処理/正規表現 · 5 LPIC-3 の幅 · 6 ペイン(ghostty) ·
7 tmux · 8 Neovim · 9 Emacs · 10 レッスン · 11 採点/仕上げ

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
