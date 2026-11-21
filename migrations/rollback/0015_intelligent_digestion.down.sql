-- Manual rollback for 0015_intelligent_digestion.sql (not auto-applied).
-- Dataset memories stay as plain memories holding their markdown summary; their rows are dropped.
-- pg_trgm is left installed (0017 and other objects may use it).
drop table if exists digested_rows;
drop table if exists digested_datasets;
delete from _migrations where name = '0015_intelligent_digestion.sql';
