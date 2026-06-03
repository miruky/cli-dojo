import type { Command } from "../types";
import { filesystemCommands } from "./filesystem";
import { textCommands } from "./text";
import { builtinCommands } from "./builtins";

export const allCommands: Command[] = [
  ...filesystemCommands,
  ...textCommands,
  ...builtinCommands,
];

export function buildRegistry(): Map<string, Command> {
  const m = new Map<string, Command>();
  for (const c of allCommands) m.set(c.name, c);
  return m;
}
