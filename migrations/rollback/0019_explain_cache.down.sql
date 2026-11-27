-- Manual rollback for 0019_explain_cache.sql (not auto-applied).
drop table if exists explain_cache;
delete from _migrations where name = '0019_explain_cache.sql';
