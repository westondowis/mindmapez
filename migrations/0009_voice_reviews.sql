-- Voice notes wait here for manual approval before they touch the live graph.
create table if not exists pending_reviews (
  id text primary key,
  user_id text not null,
  raw text not null,
  key_points_json text not null default '[]',
  keywords_json text not null default '[]',
  action text not null default 'memory',
  concept_id text,
  concept_name text,
  suggested_name text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists pending_reviews_user_idx on pending_reviews (user_id, status, created_at);

-- Light telemetry that tunes how talkative the voice assistant is.
create table if not exists voice_telemetry (
  user_id text primary key,
  turns integer not null default 0,
  barge_ins integer not null default 0,
  topics_json text not null default '{}'
);
