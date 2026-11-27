-- Cached Explain results (written summary, spoken script, optional mp3 data URL) so a repeat tap on the
-- same item costs nothing until its content changes. Never read by getGraph or any list/search query.
create table if not exists explain_cache (
  user_id      text not null,
  target_type  text not null check (target_type in ('memory','branch')),
  target_id    text not null,
  mode         text not null check (mode in ('summary','audio')),
  voice        text not null default '',
  content_hash text not null,
  payload_json text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, target_type, target_id, mode, voice)
);
create index if not exists explain_cache_user_created_idx on explain_cache (user_id, created_at desc);
