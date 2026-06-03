import type { Command } from "../types";

/** 対話アプリ起動コマンド: シェルからモード(tmux/vim/emacs)へ切替を要求する。 */
function launcher(name: string, summary: string, target?: string): Command {
  return {
    name,
    summary,
    run(ctx) {
      ctx.services.launch(target ?? name, ctx.args.slice(1));
      return 0;
    },
  };
}

export const launcherCommands: Command[] = [
  launcher("tmux", "端末多重化 (prefix Ctrl-b)"),
  launcher("vim", "Vim エディタ", "vim"),
  launcher("vi", "vi (Vim)", "vim"),
  launcher("nvim", "Neovim エディタ (LazyVim 風)", "nvim"),
  launcher("view", "Vim 閲覧モード", "vim"),
  launcher("emacs", "Emacs エディタ", "emacs"),
];
