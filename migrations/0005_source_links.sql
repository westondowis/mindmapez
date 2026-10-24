alter table memories add column if not exists source_url text;
alter table memories add column if not exists source_kind text;

alter table user_settings add column if not exists last_saved_at timestamptz;

create table if not exists account_drafts (
  user_id text primary key,
  capture_json text,
  updated_at timestamptz not null default now()
);
