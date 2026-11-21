/**
 * Tag-first hierarchical search (v5.35). Every tier reads only light, indexed columns:
 *   Tier 1  tags: exact tag on the memory 100 · prefix tag on the memory 85 ·
 *           a matching tag on a branch/sector reaches its whole subtree 75 (path-range inheritance)
 *   Tier 2  sector/branch names: name equals/starts with the term 65 · contains it 55
 *   Tier 3  memory title starts with/equals 45 · title contains 40 · executive summary contains 30
 *   Deep    (opt-in) body/transcript contains 20 · dataset row matches 15
 * Tier 0 (instant client-side filtering of the loaded lightweight graph) lives in graph-search.ts.
 * Multi-word queries score each meaningful term and rank by terms matched, then total score.
 */
import type { Sql } from "./sql-template.ts";
import { datasetRowMatches } from "./digestion/store.ts";

export const TIER_SCORES = {
  tagExact: 100,
  tagPrefix: 85,
  tagInherited: 75,
  branchPrefix: 65,
  branchContains: 55,
  titlePrefix: 45,
  titleContains: 40,
  summaryContains: 30,
  deepText: 20,
  datasetRow: 15,
} as const;

const STOP = new Set(
  "a an and are as at be but by can did do does for from had has have how i if in into is it its me my of on or our show so that the their them then there these they this to was we were what when where which who why will with you your all about any".split(
    " ",
  ),
);

export function searchTerms(query: string, max = 6): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'#-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[#'-]+|['-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
  return [...new Set(words)].slice(0, max).map((w) => w.slice(0, 64));
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type TierHit = { memoryId: string; score: number; tier: 1 | 2 | 3 | 4; via: string };
export type TieredResult = { memoryId: string; score: number; termsMatched: number; tier: 1 | 2 | 3 | 4; via: string };

function tierOf(score: number): 1 | 2 | 3 | 4 {
  return score >= 75 ? 1 : score >= 55 ? 2 : score >= 30 ? 3 : 4;
}

/** One term → best score per memory across all tiers, as a single statement. */
export async function termHits(sql: Sql, userId: string, term: string, deep: boolean): Promise<TierHit[]> {
  const exact = term;
  const prefix = `${escapeLike(term)}%`;
  const contains = `%${escapeLike(term)}%`;
  const rows = await sql.query<{ id: string; score: number; via: string }>(
    `with matched_tags as (
        select t.id, t.name, (t.name = $2) as exact
          from tags t
         where t.user_id = $1 and t.name like $3 escape '\\'
         limit 100
      ),
      tag_targets as (
        select l.target_type, l.target_id, bool_or(mt.exact) as exact, min(mt.name) as name
          from tag_links l join matched_tags mt on mt.id = l.tag_id
         where l.user_id = $1
         group by l.target_type, l.target_id
      ),
      roots as (
        select c.path, ${TIER_SCORES.tagInherited} as score, '#' || tt.name as via
          from tag_targets tt join concepts c on c.id = tt.target_id and c.user_id = $1
         where tt.target_type = 'branch' and c.path is not null
        union all
        select ('/' || brain_sector_key(tt.target_id) || '/') collate "C", ${TIER_SCORES.tagInherited}, '#' || tt.name
          from tag_targets tt where tt.target_type = 'sector'
        union all
        select c.path,
               case when lower(c.name) like $3 escape '\\' then ${TIER_SCORES.branchPrefix} else ${TIER_SCORES.branchContains} end,
               c.name
          from concepts c
         where c.user_id = $1 and c.path is not null and lower(c.name) like $4 escape '\\'
      ),
      subtree as (
        select c.id, max(r.score) as score, min(r.via) as via
          from roots r
          join concepts c on c.user_id = $1
                         and c.path >= r.path collate "C" and c.path < brain_path_end(r.path) collate "C"
         group by c.id
      ),
      hits as (
        select tt.target_id as id,
               case when tt.exact then ${TIER_SCORES.tagExact} else ${TIER_SCORES.tagPrefix} end as score,
               '#' || tt.name as via
          from tag_targets tt where tt.target_type = 'memory'
        union all
        select m.id, s.score, s.via
          from subtree s join memories m on m.user_id = $1 and m.owner_branch_id = s.id
        union all
        select mc.memory_id, s.score, s.via
          from subtree s join memory_concepts mc on mc.user_id = $1 and mc.concept_id = s.id
        union all
        select m.id,
               case when lower(m.title) like $3 escape '\\' or lower(m.title) like $5 escape '\\' then ${TIER_SCORES.titlePrefix}
                    when lower(m.title) like $4 escape '\\' then ${TIER_SCORES.titleContains}
                    else ${TIER_SCORES.summaryContains} end,
               case when lower(m.title) like $4 escape '\\' then 'title' else 'summary' end
          from memories m
         where m.user_id = $1
           and (lower(m.title) like $4 escape '\\' or lower(coalesce(m.ai_summary, '')) like $4 escape '\\')
        union all
        select m.id, ${TIER_SCORES.deepText}, 'text'
          from memories m
         where $6 and m.user_id = $1
           and (lower(m.body) like $4 escape '\\' or lower(coalesce(m.transcript, '')) like $4 escape '\\')
      )
      select h.id, max(h.score)::int as score, (array_agg(h.via order by h.score desc))[1] as via
        from hits h join memories m on m.id = h.id and m.user_id = $1
       group by h.id`,
    [userId, exact, prefix, contains, `% ${escapeLike(term)}%`, deep],
  );
  return rows.map((r) => ({ memoryId: r.id, score: Number(r.score), tier: tierOf(Number(r.score)), via: r.via }));
}

export function combineTermHits(perTerm: TierHit[][], limit: number): TieredResult[] {
  const acc = new Map<string, TieredResult>();
  for (const hits of perTerm) {
    for (const h of hits) {
      const cur = acc.get(h.memoryId);
      if (!cur) acc.set(h.memoryId, { memoryId: h.memoryId, score: h.score, termsMatched: 1, tier: h.tier, via: h.via });
      else {
        cur.score += h.score;
        cur.termsMatched += 1;
        if (h.tier < cur.tier) {
          cur.tier = h.tier;
          cur.via = h.via;
        }
      }
    }
  }
  return [...acc.values()].sort((a, b) => b.termsMatched - a.termsMatched || b.score - a.score || a.memoryId.localeCompare(b.memoryId)).slice(0, limit);
}

/** Tiered search over the whole brain. `deep` adds body/transcript and dataset rows (slower). */
export async function tieredSearch(
  sql: Sql,
  userId: string,
  query: string,
  opts: { deep?: boolean; limit?: number } = {},
): Promise<TieredResult[]> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 200);
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const perTerm: TierHit[][] = [];
  for (const t of terms) {
    const hits = await termHits(sql, userId, t, !!opts.deep);
    if (opts.deep) {
      const seen = new Set(hits.map((h) => h.memoryId));
      for (const r of await datasetRowMatches(sql, userId, t, 40)) {
        if (!seen.has(r.memoryId)) hits.push({ memoryId: r.memoryId, score: TIER_SCORES.datasetRow, tier: 4, via: `${r.matches} rows` });
      }
    }
    perTerm.push(hits);
  }
  return combineTermHits(perTerm, limit);
}
