-- Manual rollback for 0012_voice_style.sql (not auto-applied).
alter table user_settings drop column if exists voice_style_profile;
alter table user_settings drop column if exists voice_turn_count;
delete from _migrations where name = '0012_voice_style.sql';
