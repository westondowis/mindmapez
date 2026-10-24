create table if not exists user_settings (
  user_id text primary key,
  plan text not null default 'free',
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id text primary key,
  user_id text not null,
  title text not null,
  body text not null default '',
  memory_type text not null default 'text',
  emotion text,
  importance integer not null default 3,
  ai_impact text not null default 'medium',
  ai_summary text,
  transcript text,
  media_url text,
  media_mime text,
  media_name text,
  node_kind text not null default 'learning',
  tags_json text not null default '[]',
  access_count integer not null default 0,
  position_x real,
  position_y real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_id_idx on memories (user_id);
create index if not exists memories_user_created_idx on memories (user_id, created_at desc);

create table if not exists concepts (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null default 'topic',
  icon text,
  position_x real,
  position_y real,
  created_at timestamptz not null default now()
);
create unique index if not exists concepts_user_name_idx on concepts (user_id, name);
create index if not exists concepts_user_id_idx on concepts (user_id);

create table if not exists memory_concepts (
  user_id text not null,
  memory_id text not null references memories(id) on delete cascade,
  concept_id text not null references concepts(id) on delete cascade,
  primary key (memory_id, concept_id)
);
create index if not exists memory_concepts_user_idx on memory_concepts (user_id);

create table if not exists connections (
  id text primary key,
  user_id text not null,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  strength real not null default 0.5,
  reason text,
  status text not null default 'accepted',
  created_at timestamptz not null default now()
);
create index if not exists connections_user_id_idx on connections (user_id);

create table if not exists assistant_messages (
  id text primary key,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_idx on assistant_messages (user_id, created_at);
