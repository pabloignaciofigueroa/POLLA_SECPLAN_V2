import type { RankingRow } from "./types";

export function formatRankingRows(rows: RankingRow[]): RankingRow[] {
  return rows.map((row) => ({
    ...row,
    performance: Math.max(0, Math.min(100, Math.round(row.performance))),
  }));
}
