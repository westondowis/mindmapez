-- Manual rollback for 0017_tag_first_search.sql (not auto-applied). Indexes only; no data loss.
drop index if exists memories_summary_trgm_idx;
drop index if exists memories_title_trgm_idx;
drop index if exists concepts_name_trgm_idx;
drop index if exists tag_links_user_tag_idx;
drop index if exists tags_user_name_prefix_idx;
delete from _migrations where name = '0017_tag_first_search.sql';
