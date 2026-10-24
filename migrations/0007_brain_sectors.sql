-- Per-account labels, kickers, icons, and colors for the default brain sectors.
alter table user_settings add column if not exists brain_sectors_json text;
