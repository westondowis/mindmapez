-- Tagging system (v5.34). Additive and idempotent. Reverse with
-- migrations/rollback/0013_tags.down.sql (not auto-applied).
--
-- tags               canonical per-user tag (normalized lowercase name, tier, manual lock, cached count)
-- tag_links          a tag attached to a sector, a branch/sub-branch or a memory (any hierarchy level)
-- connector_tag_grants  a connector may read/search everything a tag reaches (subtree inheritance)
--
-- memories.tags_json stays the memory's display list; the app mirrors it into tag_links.

create table if not exists tags (
  id                  text primary key,
  user_id             text not null,
  name                text not null,
  slug                text not null,
  tier                text not null default 'secondary' check (tier in ('primary', 'secondary')),
  is_manual_override  boolean not null default false,
  occurrence_count    integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (name = lower(name))
);
create unique index if not exists tags_user_name_idx on tags (user_id, name);
create index if not exists tags_user_tier_idx on tags (user_id, tier);

create table if not exists tag_links (
  tag_id       text not null references tags(id) on delete cascade,
  user_id      text not null,
  target_type  text not null check (target_type in ('sector', 'branch', 'memory')),
  target_id    text not null,
  created_at   timestamptz not null default now(),
  primary key (tag_id, target_type, target_id)
);
create index if not exists tag_links_target_idx on tag_links (user_id, target_type, target_id);

create table if not exists connector_tag_grants (
  id            text primary key,
  user_id       text not null,
  connector_id  text not null references connectors(id) on delete cascade,
  tag_id        text not null references tags(id) on delete cascade,
  can_read      boolean not null default true,
  can_search    boolean not null default true,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check (not can_search or can_read)
);
create unique index if not exists connector_tag_grants_live_idx
  on connector_tag_grants (connector_id, tag_id) where revoked_at is null;

-- A deleted branch or memory takes its tag links with it.
create or replace function tag_links_cleanup() returns trigger
language plpgsql as $$
begin
  delete from tag_links
   where user_id = old.user_id and target_id = old.id
     and target_type = tg_argv[0];
  return null;
end $$;
drop trigger if exists concepts_tag_links_ad on concepts;
create trigger concepts_tag_links_ad after delete on concepts
  for each row execute function tag_links_cleanup('branch');
drop trigger if exists memories_tag_links_ad on memories;
create trigger memories_tag_links_ad after delete on memories
  for each row execute function tag_links_cleanup('memory');

-- Tag access reaches connectors through ordinary scope grants: the app derives one connector_grants
-- row (branch or sector, subtree inheritance comes from the path range) for every branch/sector a
-- granted tag is attached to, marked with via_tag_id. connector_scope_paths(), every scoped query and
-- the row-level-security policies stay exactly as 0010 made them (same query plans), and deleting a
-- tag or a branch removes its derived grants through the foreign keys.
alter table connector_grants add column if not exists via_tag_id text references tags(id) on delete cascade;
create index if not exists connector_grants_via_tag_idx on connector_grants (via_tag_id) where via_tag_id is not null;

-- Individually tagged memories a connector may read through its tag grants.
create or replace function connector_tag_memory_ids(p_user text, p_connector text, p_perm text)
returns setof text
language sql stable as $$
  select tl.target_id
    from connector_tag_grants tg
    join connectors k on k.id = tg.connector_id and k.user_id = p_user and k.status = 'active'
    join tag_links tl on tl.tag_id = tg.tag_id and tl.user_id = p_user and tl.target_type = 'memory'
   where tg.user_id = p_user
     and tg.connector_id = p_connector
     and tg.revoked_at is null
     and case p_perm
           when 'read' then tg.can_read
           when 'search' then tg.can_search
           else false
         end
$$;

-- Same defense-in-depth as 0010: a host without role privileges logs a notice and keeps going.
do $rls$
begin
  if exists (select 1 from pg_roles where rolname = 'brain_connector') then
    grant select on tags, tag_links, connector_tag_grants to brain_connector;
    grant execute on function connector_tag_memory_ids(text, text, text) to brain_connector;
    drop policy if exists memories_connector_tag on memories;
    create policy memories_connector_tag on memories for select to brain_connector using (
      user_id = current_setting('brain.user_id', true)
      and memories.id in (select connector_tag_memory_ids(current_setting('brain.user_id', true),
                                                          current_setting('brain.connector_id', true), 'read')));
  end if;
exception when others then
  raise notice 'tag row-level security skipped: % (%)', sqlerrm, sqlstate;
end
$rls$;
