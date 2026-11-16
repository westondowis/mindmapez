-- Manual rollback for 0013_tags.sql (not auto-applied).
drop policy if exists memories_connector_tag on memories;
drop trigger if exists concepts_tag_links_ad on concepts;
drop trigger if exists memories_tag_links_ad on memories;
drop function if exists tag_links_cleanup();
drop function if exists connector_tag_memory_ids(text, text, text);
delete from connector_grants where via_tag_id is not null;
alter table connector_grants drop column if exists via_tag_id;
drop table if exists connector_tag_grants;
drop table if exists tag_links;
drop table if exists tags;
delete from _migrations where name = '0013_tags.sql';
