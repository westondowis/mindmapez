-- Progressive voice style: a short distilled profile plus a running voice-turn counter.
alter table user_settings add column if not exists voice_style_profile text;
alter table user_settings add column if not exists voice_turn_count integer not null default 0;
