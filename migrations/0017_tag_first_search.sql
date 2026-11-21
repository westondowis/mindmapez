-- v5.35 tag-first hierarchical search. Tier 1 = tags (prefix) + subtree inheritance over
-- concepts.path, tier 2 = sector/branch names, tier 3 = title + executive summary (ai_summary).
-- None of these read body/transcript/media_url. Trigram indexes are created only when pg_trgm
-- is available (see 0015); without them the same queries still work, just as scans.
create index if not exists tags_user_name_prefix_idx on tags (user_id, name text_pattern_ops);
create index if not exists tag_links_user_tag_idx on tag_links (user_id, tag_id, target_type);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists concepts_name_trgm_idx on concepts using gin (lower(name) gin_trgm_ops)';
    execute 'create index if not exists memories_title_trgm_idx on memories using gin (lower(title) gin_trgm_ops)';
    execute 'create index if not exists memories_summary_trgm_idx on memories using gin (lower(coalesce(ai_summary, '''')) gin_trgm_ops)';
  end if;
end $$;
