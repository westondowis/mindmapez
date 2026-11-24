-- Manual rollback for 0018_voice_choice.sql (not auto-applied).
alter table user_settings drop column if exists voice_choice;
delete from _migrations where name = '0018_voice_choice.sql';
