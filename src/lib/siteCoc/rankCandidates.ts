import { normShop } from "./normalize";

export interface RankInput { id: string; name: string; tenant_name?: string | null }
export interface RankedCandidate { id: string; name: string; score: number }

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function editSim(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function tokenOverlap(a: string, b: string): number {
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = new Set(b.split(" ").filter(Boolean));
  if (!at.size || !bt.size) return 0;
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  return inter / new Set([...at, ...bt]).size;
}

function score(query: string, key: string): number {
  if (!key) return 0;
  return Math.max(editSim(query, key), tokenOverlap(query, key));
}

/** Rank subsections by similarity to a shop/trading name. Returns top-N sorted descending. */
export function rankSubsectionCandidates(query: string, subs: RankInput[], topN = 3): RankedCandidate[] {
  const q = normShop(query);
  if (!q) return [];
  return subs
    .map((s) => {
      const keys = [normShop(s.name), s.tenant_name ? normShop(s.tenant_name) : ""];
      const best = Math.max(...keys.map((k) => score(q, k)));
      const label = s.tenant_name && s.tenant_name !== s.name ? `${s.name} · ${s.tenant_name}` : s.name;
      return { id: s.id, name: label, score: best };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
