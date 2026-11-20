-- Manual rollback for 0014_custom_emojis.sql (not auto-applied).
-- Branches still holding a `custom:<id>` emoji fall back to the default glyph.
drop table if exists custom_emojis;
delete from _migrations where name = '0014_custom_emojis.sql';
