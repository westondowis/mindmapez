-- Manual rollback for 0011_app_hub.sql (not auto-applied).
drop table if exists pending_actions;
alter table connector_grants drop column if exists allowed_domains;
alter table connector_grants drop column if exists allowed_apps;
-- The widened audit action check is left in place: audit rows can't be deleted,
-- and rows written with the new action kinds must stay valid.
delete from _migrations where name = '0011_app_hub.sql';
