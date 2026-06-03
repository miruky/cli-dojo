import type { Command } from "../types";
import { filesystemCommands } from "./filesystem";
import { textCommands } from "./text";
import { builtinCommands } from "./builtins";
import { grep } from "./grep";
import { filterCommands } from "./filters";
import { sed } from "./sed";
import { awk } from "./awk";
import { find } from "./find";
import { textMoreCommands } from "./textmore";

const egrep: Command = { name: "egrep", summary: "grep -E と同じ", run: grep.run };
const fgrep: Command = { name: "fgrep", summary: "grep -F と同じ", run: grep.run };

export const allCommands: Command[] = [
  ...filesystemCommands,
  ...textCommands,
  ...builtinCommands,
  grep,
  egrep,
  fgrep,
  ...filterCommands,
  sed,
  awk,
  find,
  ...textMoreCommands,
];

export function buildRegistry(): Map<string, Command> {
  const m = new Map<string, Command>();
  for (const c of allCommands) m.set(c.name, c);
  return m;
}
