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
import { permissionCommands } from "./permissions";
import { sysinfoCommands } from "./sysinfo";
import { hashingCommands } from "./hashing";
import { archiveCommands } from "./archives";
import { simCommands } from "./sims";

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
  ...permissionCommands,
  ...sysinfoCommands,
  ...hashingCommands,
  ...archiveCommands,
  ...simCommands,
];

export function buildRegistry(): Map<string, Command> {
  const m = new Map<string, Command>();
  for (const c of allCommands) m.set(c.name, c);
  return m;
}
