import type { ITheme } from "@xterm/xterm";

/**
 * Cobalt Next 系パレット。背景は完全透過にして、下層の
 * ガラスパネル (#app の backdrop-filter) を透かして見せる。
 * = 実機 ghostty の background-opacity 0.8 + blur 20 を web で再現。
 */
export const COBALT_THEME: ITheme = {
  background: "rgba(0, 0, 0, 0)",
  foreground: "#d6e0f5",
  cursor: "#ffc600",
  cursorAccent: "#0a1020",
  selectionBackground: "rgba(0, 136, 255, 0.35)",
  black: "#16213a",
  red: "#ff628c",
  green: "#3ad900",
  yellow: "#ffc600",
  blue: "#0088ff",
  magenta: "#fb94ff",
  cyan: "#18b3c7",
  white: "#c7d3e8",
  brightBlack: "#626688",
  brightRed: "#ff849c",
  brightGreen: "#67ec5a",
  brightYellow: "#ffe066",
  brightBlue: "#5ab0ff",
  brightMagenta: "#ffb3ff",
  brightCyan: "#6fe0ef",
  brightWhite: "#ffffff",
};

export const TERMINAL_FONT =
  "'CaskaydiaMono NF', 'HackGen Console NF', 'HackGen Console', ui-monospace, 'SFMono-Regular', Menlo, monospace";
