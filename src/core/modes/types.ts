/** 端末のモード定義。Linux / tmux / Neovim / Emacs / Ghostty。 */
export type ModeId = "linux" | "tmux" | "nvim" | "emacs" | "ghostty";

export interface ModeMeta {
  id: ModeId;
  /** メニュー等に出す正式名 */
  label: string;
  /** ステータスバー用の短い表記 */
  badge: string;
  /** アクセント色 (CSS 値) */
  color: string;
  /** 一行説明 */
  hint: string;
  /** SVG アイコン名 (ui/icons.ts) */
  icon: string;
}

export const MODES: Record<ModeId, ModeMeta> = {
  linux: {
    id: "linux",
    label: "Linux Shell",
    badge: "LINUX",
    color: "var(--accent-green)",
    hint: "bash 風シェル。コマンドを自由に実行。",
    icon: "terminal-square",
  },
  tmux: {
    id: "tmux",
    label: "tmux",
    badge: "TMUX",
    color: "#67ec5a",
    hint: "端末多重化。prefix Ctrl-b。",
    icon: "grid",
  },
  nvim: {
    id: "nvim",
    label: "Neovim",
    badge: "NVIM",
    color: "var(--accent-green)",
    hint: "モーダルエディタ (LazyVim 風)。",
    icon: "edit",
  },
  emacs: {
    id: "emacs",
    label: "Emacs",
    badge: "EMACS",
    color: "var(--accent-magenta)",
    hint: "C-x C-c で終了などデフォルト準拠。",
    icon: "file-text",
  },
  ghostty: {
    id: "ghostty",
    label: "Ghostty",
    badge: "GHOSTTY",
    color: "var(--accent)",
    hint: "ペイン分割・移動 (あなたの設定準拠)。",
    icon: "ghost",
  },
};

export const MODE_ORDER: ModeId[] = ["linux", "tmux", "nvim", "emacs", "ghostty"];
