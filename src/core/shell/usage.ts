/** コマンド使用統計。stats コマンドのデータ源 (localStorage 永続)。 */

const KEY = "cli-dojo.stats.cmds";

export interface UsageData {
  total: number;
  counts: Record<string, number>;
}

export function loadUsage(): UsageData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<UsageData>;
    return { total: raw.total ?? 0, counts: raw.counts ?? {} };
  } catch {
    return { total: 0, counts: {} };
  }
}

function save(data: UsageData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 保存不可でもシェルは動かす */
  }
}

/**
 * 実行行からコマンド名を抽出してカウントする。
 * パイプ/連結 (| ; && ||) の各セグメント先頭語を対象に、実在コマンドのみ数える。
 */
export function recordUsage(line: string, isCommand: (name: string) => boolean): void {
  const segs = line.split(/\||;|&&|\|\|/);
  const names: string[] = [];
  for (const seg of segs) {
    let word = seg.trim().split(/\s+/)[0] ?? "";
    // 変数代入 (X=1 cmd) はスキップして次の語へ
    const parts = seg.trim().split(/\s+/);
    let i = 0;
    while (i < parts.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[i])) i++;
    word = parts[i] ?? "";
    if (word && isCommand(word)) names.push(word);
  }
  if (names.length === 0) return;
  const data = loadUsage();
  data.total += 1;
  for (const n of names) data.counts[n] = (data.counts[n] ?? 0) + 1;
  save(data);
}
